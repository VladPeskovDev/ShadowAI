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
let chunkFiles = []; // ring buffer of file paths
let isProcessing = false;

const CHUNK_DURATION = 10; // секунд на чанк
const MAX_CHUNKS = 12;     // хранить последние 2 минуты (12 * 10 = 120 сек)
const PROCESS_CHUNKS = 3;  // обрабатывать последние 30 сек (3 * 10)

const sessionDir = path.join(os.tmpdir(), 'shadowai-call-session');

// --- Public API ---

function startCallSession() {
  if (isActive) return;

  // Чистим/создаём директорию
  if (fs.existsSync(sessionDir)) {
    fs.readdirSync(sessionDir).forEach(f => {
      try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
    });
  } else {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  isActive = true;
  chunkIndex = 0;
  chunkFiles = [];

  ipcMain.emit('log-message', null, {
    type: 'info',
    message: 'Call session запущена — непрерывная запись',
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

  // Чистим временные файлы
  chunkFiles.forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });
  chunkFiles = [];

  ipcMain.emit('log-message', null, {
    type: 'info',
    message: 'Call session остановлена',
  });
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
 * Обработать последние N секунд записи
 */
async function processLastChunks() {
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

  // Берём готовые чанки (все кроме текущего записываемого)
  const readyChunks = chunkFiles.slice(0, -1).slice(-PROCESS_CHUNKS);

  if (readyChunks.length === 0) {
    ipcMain.emit('log-message', null, {
      type: 'warning',
      message: 'Недостаточно записи — подождите несколько секунд',
    });
    return;
  }

  // Проверяем что файлы существуют и не пустые
  const validChunks = readyChunks.filter(f => {
    try {
      return fs.existsSync(f) && fs.statSync(f).size > 0;
    } catch { return false; }
  });

  if (validChunks.length === 0) return;

  isProcessing = true;

  const timer = new Timer('CALL SESSION');

  try {
    // Склеиваем чанки в один файл
    timer.mark('Склейка чанков');
    const mergedFile = path.join(sessionDir, `merged_${Date.now()}.wav`);
    await mergeChunks(validChunks, mergedFile);

    if (!fs.existsSync(mergedFile) || fs.statSync(mergedFile).size === 0) {
      ipcMain.emit('log-message', null, {
        type: 'error',
        message: 'Не удалось склеить аудио-чанки',
      });
      isProcessing = false;
      timer.end();
      return;
    }

    // Whisper — локальный или API fallback
    let text;
    if (isWhisperAvailable()) {
      timer.mark('Транскрибация (локальный Whisper)');
      text = transcribeLocal(mergedFile, 'ru');
    } else {
      timer.mark('Транскрибация (Whisper API fallback)');
      const openai = getOpenAIClient();
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(mergedFile),
        model: 'whisper-1',
        language: 'ru',
      });
      text = transcription.text;
    }

    timer.mark('Транскрибация завершена');

    // Удаляем merged файл
    try { fs.unlinkSync(mergedFile); } catch {}

    if (!text || text.trim() === '') {
      ipcMain.emit('log-message', null, {
        type: 'warning',
        message: 'Whisper не распознал речь',
      });
      isProcessing = false;
      timer.end();
      return;
    }

    ipcMain.emit('log-message', null, {
      type: 'info',
      message: `Распознано: "${text}"`,
    });

    // Сохраняем в контекст
    addEntry('me', text);

    // GPT
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

  // Удаляем старые чанки если превысили лимит
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
    if (error && !error.killed && isActive) {
      // ffmpeg завершился нормально (по -t) — запускаем следующий чанк
    }
    ffmpegProcess = null;

    if (isActive) {
      startNextChunk();
    }
  });
}

function mergeChunks(files, outputPath) {
  return new Promise((resolve, reject) => {
    if (files.length === 1) {
      fs.copyFileSync(files[0], outputPath);
      return resolve();
    }

    // ffmpeg concat через file list
    const listFile = path.join(sessionDir, 'concat_list.txt');
    const listContent = files.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const cmd = `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -ar 16000 -ac 1 -y "${outputPath}"`;

    exec(cmd, (error) => {
      try { fs.unlinkSync(listFile); } catch {}

      if (error) {
        console.error('[callSession] Merge error:', error.message);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  startCallSession,
  stopCallSession,
  toggleCallSession,
  isCallSessionActive,
  processLastChunks,
};
