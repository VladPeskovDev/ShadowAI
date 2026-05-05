const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { ipcMain } = require('electron');
const { getMicrophoneIndex, getAudioPrompt } = require('./telegram');
const { getOpenAIClient } = require('../utils/openaiClient');
const { sendOverlayText } = require('../utils/overlayMessenger');
const { addEntry, buildContext } = require('../utils/context');
const { transcribeLocal, isWhisperAvailable } = require('../utils/localWhisper');
const { Timer } = require('../utils/timer');

const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

// --- State ---
let isActive = false;
let ffmpegProcess = null;
let chunkIndex = 0;
let chunkFiles = [];
let isProcessing = false;
let isTranscribing = false;

// Session metadata
let sessionMeta = null;
let transcriptFile = null;

const CHUNK_DURATION = 10;
const MAX_CHUNKS = 12;

const sessionDir = path.join(os.tmpdir(), 'shadowai-call-session');
const docsDir = path.join(os.homedir(), 'Documents', 'ShadowAI');

// --- Public API ---

function startCallSession(metadata = {}) {
  if (isActive) return;

  // Создаём папки
  if (fs.existsSync(sessionDir)) {
    fs.readdirSync(sessionDir).forEach(f => {
      try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
    });
  } else {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Metadata
  sessionMeta = {
    title: metadata.title || 'Без названия',
    description: metadata.description || '',
    startTime: new Date(),
  };

  // Создаём файл стенограммы
  const dateStr = formatDate(sessionMeta.startTime);
  const safeTitle = sessionMeta.title.replace(/[/\\?%*:|"<>]/g, '_');
  transcriptFile = path.join(docsDir, `${dateStr}_${safeTitle}.md`);

  const header = [
    `# ${sessionMeta.title}`,
    `**Дата:** ${sessionMeta.startTime.toLocaleString('ru-RU')}`,
    sessionMeta.description ? `**Описание:** ${sessionMeta.description}` : '',
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');

  fs.writeFileSync(transcriptFile, header);

  isActive = true;
  chunkIndex = 0;
  chunkFiles = [];

  ipcMain.emit('log-message', null, {
    type: 'info',
    message: `Call session: "${sessionMeta.title}" — запись идёт`,
  });

  startNextChunk();
}

function stopCallSession() {
  if (!isActive) return;

  isActive = false;

  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }

  // Дописываем финал в стенограмму
  if (transcriptFile && fs.existsSync(transcriptFile)) {
    const endTime = new Date();
    const duration = Math.round((endTime - sessionMeta.startTime) / 60000);
    fs.appendFileSync(transcriptFile, `\n---\n**Завершено:** ${endTime.toLocaleTimeString('ru-RU')} (${duration} мин)\n`);
  }

  // Чистим временные файлы
  chunkFiles.forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });
  chunkFiles = [];

  ipcMain.emit('log-message', null, {
    type: 'info',
    message: `Call session остановлена. Стенограмма: ${transcriptFile}`,
  });

  sessionMeta = null;
  transcriptFile = null;
}

function toggleCallSession() {
  if (isActive) {
    stopCallSession();
  } else {
    startCallSession();
  }
  return isActive;
}

function isCallSessionActive() {
  return isActive;
}

/**
 * Отправить готовый текст из transcript в GPT (без whisper)
 */
async function processFromTranscript() {
  if (!isActive) {
    ipcMain.emit('log-message', null, {
      type: 'warning',
      message: 'Call session не запущена',
    });
    return;
  }

  if (isProcessing) {
    ipcMain.emit('log-message', null, {
      type: 'warning',
      message: 'Предыдущий запрос ещё обрабатывается',
    });
    return;
  }

  isProcessing = true;
  const timer = new Timer('CALL SESSION');

  try {
    const openai = getOpenAIClient();
    const audioPrompt = getAudioPrompt() || 'Ты полезный ассистент.';
    const messages = buildContext(audioPrompt);

    timer.mark('Начало стриминга GPT');

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
    });

    let fullResponse = '';
    let isFirstChunk = true;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        if (isFirstChunk) {
          timer.mark('Первый chunk GPT');
          isFirstChunk = false;
        }
        fullResponse += content;
        sendOverlayText(fullResponse, true);
      }
    }

    timer.mark('Стриминг завершён');

    addEntry('assistant', fullResponse);
    appendToTranscript('assistant', fullResponse);
    sendOverlayText(fullResponse, false);

    timer.end();
  } catch (err) {
    console.error('[callSession] Error:', err.message);
    ipcMain.emit('log-message', null, {
      type: 'error',
      message: `Ошибка call session: ${err.message}`,
    });
    timer.end();
  } finally {
    isProcessing = false;
  }
}

// --- Internal ---

function startNextChunk() {
  if (!isActive) return;

  const micIndex = getMicrophoneIndex() || ':0';
  const chunkFile = path.join(sessionDir, `chunk_${String(chunkIndex).padStart(4, '0')}.wav`);

  chunkFiles.push(chunkFile);
  chunkIndex++;

  while (chunkFiles.length > MAX_CHUNKS) {
    const old = chunkFiles.shift();
    try { fs.unlinkSync(old); } catch {}
  }

  const platform = os.platform();
  let cmd;

  if (platform === 'darwin') {
    cmd = `"${ffmpegPath}" -f avfoundation -i "${micIndex}" -t ${CHUNK_DURATION} -ar 16000 -ac 1 -y "${chunkFile}"`;
  } else if (platform === 'win32') {
    cmd = `"${ffmpegPath}" -f dshow -i audio="${micIndex}" -t ${CHUNK_DURATION} -ar 16000 -ac 1 -y "${chunkFile}"`;
  } else {
    cmd = `"${ffmpegPath}" -f alsa -i "${micIndex}" -t ${CHUNK_DURATION} -ar 16000 -ac 1 -y "${chunkFile}"`;
  }

  ffmpegProcess = exec(cmd, (error) => {
    ffmpegProcess = null;

    if (isActive) {
      // Чанк записан — транскрибируем фоново
      transcribeChunk(chunkFile);
      startNextChunk();
    }
  });
}

/**
 * Фоновая транскрипция чанка — результат в transcript + файл
 */
async function transcribeChunk(chunkFile) {
  if (!isActive) return;
  if (!fs.existsSync(chunkFile) || fs.statSync(chunkFile).size === 0) return;

  // Ждём если другая транскрипция идёт (последовательно, не параллельно)
  while (isTranscribing) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isTranscribing = true;

  try {
    let text = null;

    if (isWhisperAvailable()) {
      text = transcribeLocal(chunkFile, 'ru');
    }

    if (text && text.trim() !== '') {
      addEntry('me', text);
      appendToTranscript('me', text);

      ipcMain.emit('log-message', null, {
        type: 'info',
        message: `[live] ${text.substring(0, 60)}...`,
      });
    }
  } catch (err) {
    console.error('[callSession] Transcribe chunk error:', err.message);
  } finally {
    isTranscribing = false;
  }
}

/**
 * Дописать строку в файл стенограммы
 */
function appendToTranscript(speaker, text) {
  if (!transcriptFile || !fs.existsSync(transcriptFile)) return;

  const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = speaker === 'me' ? 'Я'
    : speaker === 'them' ? 'Собеседник'
    : speaker === 'assistant' ? '💡 Подсказка'
    : speaker;

  const line = `[${timeStr}] ${label}: ${text}\n`;

  try {
    fs.appendFileSync(transcriptFile, line);
  } catch (err) {
    console.error('[callSession] Write transcript error:', err.message);
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  startCallSession,
  stopCallSession,
  toggleCallSession,
  isCallSessionActive,
  processFromTranscript,
};
