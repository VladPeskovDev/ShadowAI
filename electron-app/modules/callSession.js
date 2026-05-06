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
const { getSessionPrompt } = require('../utils/sessionPrompts');

const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

// --- State ---
let isActive = false;
let ffmpegProcess = null;
let chunkIndex = 0;
let chunkFiles = [];
let isProcessing = false;
let isTranscribing = false;

// System audio (BlackHole)
let sysAudioProcess = null;
let sysChunkIndex = 0;
let sysChunkFiles = [];

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
    mode: metadata.mode || 'interview',
    startTime: new Date(),
  };

  // Создаём файл стенограммы
  const dateStr = formatDate(sessionMeta.startTime);
  const safeTitle = sessionMeta.title.replace(/[/\\?%*:|"<>]/g, '_');
  transcriptFile = path.join(docsDir, `${dateStr}_${safeTitle}.md`);

  const modeLabels = { interview: 'Собеседование', translator: 'Переводчик', meeting: 'Встреча' };
  const header = [
    `# ${sessionMeta.title}`,
    `**Дата:** ${sessionMeta.startTime.toLocaleString('ru-RU')}`,
    `**Режим:** ${modeLabels[sessionMeta.mode] || sessionMeta.mode}`,
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

  // Переключаем audio output на Multi-Output Device (для BlackHole)
  switchAudioOutput('multi-output');

  // Запускаем mic запись (чанками через ffmpeg)
  startNextChunk();

  // Запускаем system audio через BlackHole (если доступен)
  sysChunkIndex = 0;
  sysChunkFiles = [];
  startNextSysChunk();
}

function stopCallSession() {
  if (!isActive) return;

  isActive = false;

  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }

  // Останавливаем system audio
  if (sysAudioProcess) {
    sysAudioProcess.kill('SIGTERM');
    sysAudioProcess = null;
  }

  // Чистим sys chunk файлы
  sysChunkFiles.forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });
  sysChunkFiles = [];

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

  // Возвращаем audio output на динамики
  switchAudioOutput('speakers');

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
    // Объединяем: промпт режима + пользовательский промпт из настроек
    const modePrompt = sessionMeta ? getSessionPrompt(sessionMeta.mode) : '';
    const userPrompt = getAudioPrompt() || '';
    const parts = [modePrompt, userPrompt].filter(Boolean);
    const prompt = parts.length > 0
      ? parts.join('\n\nДополнительный контекст от пользователя:\n')
      : 'Ты полезный ассистент.';
    const messages = buildContext(prompt);

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
        message: `[MIC/Я] ${text.substring(0, 80)}`,
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

// --- System audio recording via BlackHole (ffmpeg) ---

const BLACKHOLE_DEVICE = 'BlackHole 2ch';

function startNextSysChunk() {
  if (!isActive) return;

  // Проверяем доступность BlackHole
  if (sysChunkIndex === 0) {
    const { spawnSync } = require('child_process');
    const result = spawnSync(ffmpegPath, ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
      encoding: 'utf8',
    });
    const stderr = result.stderr || '';
    if (!stderr.includes('BlackHole')) {
      ipcMain.emit('log-message', null, {
        type: 'warning',
        message: 'BlackHole не найден — system audio не записывается. Установите: brew install blackhole-2ch',
      });
      return;
    }
  }

  const chunkFile = path.join(sessionDir, `sys_chunk_${String(sysChunkIndex).padStart(4, '0')}.wav`);
  sysChunkFiles.push(chunkFile);
  sysChunkIndex++;

  // Удаляем старые sys чанки
  while (sysChunkFiles.length > MAX_CHUNKS) {
    const old = sysChunkFiles.shift();
    try { fs.unlinkSync(old); } catch {}
  }

  const cmd = `"${ffmpegPath}" -f avfoundation -i ":${BLACKHOLE_DEVICE}" -t ${CHUNK_DURATION} -ar 16000 -ac 1 -y "${chunkFile}"`;

  sysAudioProcess = exec(cmd, (error) => {
    sysAudioProcess = null;

    if (isActive) {
      // Транскрибируем чанк system audio
      transcribeSysChunk(chunkFile);
      startNextSysChunk();
    }
  });
}

async function transcribeSysChunk(chunkFile) {
  if (!isActive) return;
  if (!fs.existsSync(chunkFile) || fs.statSync(chunkFile).size === 0) return;

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
      addEntry('them', text);
      appendToTranscript('them', text);

      ipcMain.emit('log-message', null, {
        type: 'info',
        message: `[SYSTEM/Собеседник] ${text.substring(0, 80)}`,
      });
    }
  } catch (err) {
    console.error('[callSession] Sys transcribe error:', err.message);
  } finally {
    isTranscribing = false;
  }
}

// --- Audio output switching ---

let previousAudioOutput = null;

function switchAudioOutput(target) {
  const { execSync } = require('child_process');

  try {
    // Проверяем есть ли SwitchAudioSource
    execSync('which SwitchAudioSource', { encoding: 'utf8' });
  } catch {
    console.log('[callSession] SwitchAudioSource not found — install: brew install switchaudio-osx');
    return;
  }

  try {
    if (target === 'multi-output') {
      // Запоминаем текущий output
      previousAudioOutput = execSync('SwitchAudioSource -c -t output', { encoding: 'utf8' }).trim();

      // Ищем Multi-Output Device
      const devices = execSync('SwitchAudioSource -a -t output', { encoding: 'utf8' });
      const multiOutput = devices.split('\n').find(d =>
        d.toLowerCase().includes('multi') || d.toLowerCase().includes('много')
      );

      if (multiOutput) {
        execSync(`SwitchAudioSource -s "${multiOutput.trim()}" -t output`);
        console.log(`[callSession] Audio output → ${multiOutput.trim()}`);
      } else {
        console.log('[callSession] Multi-Output Device not found');
      }
    } else if (target === 'speakers') {
      if (previousAudioOutput && !previousAudioOutput.toLowerCase().includes('multi')) {
        execSync(`SwitchAudioSource -s "${previousAudioOutput}" -t output`);
        console.log(`[callSession] Audio output → ${previousAudioOutput}`);
      } else {
        // Fallback — ищем динамики
        const devices = execSync('SwitchAudioSource -a -t output', { encoding: 'utf8' });
        const speakers = devices.split('\n').find(d =>
          d.includes('MacBook') || d.includes('Speaker') || d.includes('Динамик')
        );
        if (speakers) {
          execSync(`SwitchAudioSource -s "${speakers.trim()}" -t output`);
          console.log(`[callSession] Audio output → ${speakers.trim()}`);
        }
      }
      previousAudioOutput = null;
    }
  } catch (err) {
    console.error('[callSession] Audio switch error:', err.message);
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
