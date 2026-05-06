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
const { initVAD, processWavFile, resetVAD } = require('../utils/vad');
const log = require('../utils/logger');
const { GPT_MODEL, CHUNK_DURATION, MAX_CHUNKS, PROCESS_CHUNKS, SILENCE_RMS_THRESHOLD, BLACKHOLE_DEVICE } = require('../utils/constants');

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

// Constants imported from utils/constants.js

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
  lastTranscriptions = [];

  ipcMain.emit('log-message', null, {
    type: 'info',
    message: `Call session: "${sessionMeta.title}" — запись идёт`,
  });

  // Инициализируем VAD — только если включены авто-подсказки
  if (metadata.autoVAD) {
    initVAD(() => {
      if (isActive && !isProcessing) {
        ipcMain.emit('log-message', null, {
          type: 'info',
          message: '[VAD] Авто-подсказка — собеседник замолчал',
        });
        processFromTranscript();
      }
    });
  }

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

  // Сбрасываем VAD
  resetVAD();

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
 * Простой режим: взять последние 3 чанка → whisper → GPT → overlay
 */
async function processLastChunksSimple() {
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

  const readyChunks = chunkFiles.slice(0, -1).slice(-PROCESS_CHUNKS);

  if (readyChunks.length === 0) {
    ipcMain.emit('log-message', null, {
      type: 'warning',
      message: 'Недостаточно записи — подождите несколько секунд',
    });
    return;
  }

  const validChunks = readyChunks.filter(f => {
    try { return fs.existsSync(f) && fs.statSync(f).size > 0; }
    catch { return false; }
  });
  if (validChunks.length === 0) return;

  isProcessing = true;
  const timer = new Timer('CALL SESSION (simple)');

  try {
    // Склеиваем чанки
    timer.mark('Склейка чанков');
    const mergedFile = path.join(sessionDir, `merged_${Date.now()}.wav`);
    await mergeChunks(validChunks, mergedFile);

    if (!fs.existsSync(mergedFile) || fs.statSync(mergedFile).size === 0) {
      isProcessing = false;
      timer.end();
      return;
    }

    // Whisper
    timer.mark('Транскрибация');
    let text = null;
    if (isWhisperAvailable()) {
      text = transcribeLocal(mergedFile, 'ru');
    }
    try { fs.unlinkSync(mergedFile); } catch {}

    timer.mark('Транскрибация завершена');

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
      message: `Распознано: "${text.substring(0, 80)}"`,
    });

    addEntry('me', text);
    appendToTranscript('me', text);

    // GPT
    const openai = getOpenAIClient();
    const modePrompt = sessionMeta ? getSessionPrompt(sessionMeta.mode) : '';
    const userPrompt = getAudioPrompt() || '';
    const parts = [modePrompt, userPrompt].filter(Boolean);
    const prompt = parts.length > 0
      ? parts.join('\n\nДополнительный контекст от пользователя:\n')
      : 'Ты полезный ассистент.';
    const messages = buildContext(prompt);

    timer.mark('Начало стриминга GPT');

    const stream = await openai.chat.completions.create({
      model: GPT_MODEL,
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
    log.error('[callSession] Simple mode error:', err.message);
    ipcMain.emit('log-message', null, {
      type: 'error',
      message: `Ошибка: ${err.message}`,
    });
    timer.end();
  } finally {
    isProcessing = false;
  }
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
      model: GPT_MODEL,
      messages,
      stream: true,
    });

    let fullResponse = '';
    let isFirstChunk = true;
    let skipCheckDone = false;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        if (isFirstChunk) {
          timer.mark('Первый chunk GPT');
          isFirstChunk = false;
        }

        fullResponse += content;

        // Буферизируем первые символы для проверки SKIP
        if (!skipCheckDone) {
          const trimmed = fullResponse.trim().toUpperCase();
          // Ещё может быть SKIP — ждём
          if (trimmed.length < 4 && 'SKIP'.startsWith(trimmed)) {
            continue;
          }
          // Это SKIP
          if (trimmed === 'SKIP' || trimmed.startsWith('SKIP')) {
            log.log('[callSession] GPT returned SKIP — no response needed');
            timer.end();
            return;
          }
          // Не SKIP — показываем накопленное
          skipCheckDone = true;
        }

        sendOverlayText(fullResponse, true);
      }
    }

    timer.mark('Стриминг завершён');

    // Финальная проверка SKIP (если ответ был ровно "SKIP")
    if (fullResponse.trim().toUpperCase() === 'SKIP') {
      log.log('[callSession] GPT returned SKIP — no response needed');
      timer.end();
      return;
    }

    addEntry('assistant', fullResponse);
    appendToTranscript('assistant', fullResponse);
    sendOverlayText(fullResponse, false);

    timer.end();
  } catch (err) {
    log.error('[callSession] Error:', err.message);
    ipcMain.emit('log-message', null, {
      type: 'error',
      message: `Ошибка call session: ${err.message}`,
    });
    timer.end();
  } finally {
    isProcessing = false;
  }
}

// --- Audio filtering ---

let lastTranscriptions = []; // последние N результатов для детекции повторов

function isAudioSilent(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    if (data.length < 46) return true;

    const pcmData = data.slice(44);
    let sumSquares = 0;
    const sampleCount = Math.floor(pcmData.length / 2);

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i) / 32768.0;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / sampleCount);
    // RMS < 0.01 = практически тишина
    return rms < SILENCE_RMS_THRESHOLD;
  } catch {
    return true;
  }
}

function isHallucination(text) {
  if (!text) return true;
  const clean = text.trim().toLowerCase();

  // Известные галлюцинации whisper
  const hallucinations = [
    'с вами был', 'редактор субтитров', 'субтитры',
    'подписывайтесь', 'ставьте лайк', 'до новых встреч',
    'благодарю за внимание', 'спасибо за просмотр',
  ];

  for (const h of hallucinations) {
    if (clean.includes(h)) return true;
  }

  // Детекция повторов — если один и тот же текст 2+ раза подряд
  lastTranscriptions.push(clean);
  if (lastTranscriptions.length > 5) lastTranscriptions.shift();

  const duplicates = lastTranscriptions.filter(t => t === clean).length;
  if (duplicates >= 2) return true;

  return false;
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
      transcribeChunkGeneric(chunkFile, 'me');
      startNextChunk();
    }
  });
}

/**
 * Фоновая транскрипция чанка — результат в transcript + файл
 */
/**
 * Универсальная транскрипция чанка
 * @param {string} chunkFile — путь к WAV
 * @param {'me'|'them'} speaker — кто говорил
 * @param {boolean} runVAD — прогнать через VAD после транскрипции
 */
async function transcribeChunkGeneric(chunkFile, speaker, runVAD = false) {
  if (!isActive) return;
  if (!fs.existsSync(chunkFile) || fs.statSync(chunkFile).size === 0) return;
  if (isAudioSilent(chunkFile)) return;

  while (isTranscribing) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isTranscribing = true;

  try {
    let text = null;

    if (isWhisperAvailable()) {
      text = transcribeLocal(chunkFile, 'ru');
    }

    if (text && text.trim() !== '' && !isHallucination(text)) {
      addEntry(speaker, text);
      appendToTranscript(speaker, text);

      const label = speaker === 'me' ? '[MIC/Я]' : '[SYSTEM/Собеседник]';
      ipcMain.emit('log-message', null, {
        type: 'info',
        message: `${label} ${text.substring(0, 80)}`,
      });
    }

    if (runVAD) {
      await processWavFile(chunkFile);
    }
  } catch (err) {
    log.error('[callSession] Transcribe error:', err.message);
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
    log.error('[callSession] Write transcript error:', err.message);
  }
}

// --- System audio recording via BlackHole (ffmpeg) ---

// BLACKHOLE_DEVICE imported from constants

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
      transcribeChunkGeneric(chunkFile, 'them', true);
      startNextSysChunk();
    }
  });
}

// transcribeSysChunk removed — uses transcribeChunkGeneric('them', true)

// --- Audio output switching ---

let previousAudioOutput = null;

function switchAudioOutput(target) {
  const { execSync } = require('child_process');

  try {
    // Проверяем есть ли SwitchAudioSource
    execSync('which SwitchAudioSource', { encoding: 'utf8' });
  } catch {
    log.log('[callSession] SwitchAudioSource not found — install: brew install switchaudio-osx');
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
        log.log(`[callSession] Audio output → ${multiOutput.trim()}`);
      } else {
        log.log('[callSession] Multi-Output Device not found');
      }
    } else if (target === 'speakers') {
      if (previousAudioOutput && !previousAudioOutput.toLowerCase().includes('multi')) {
        execSync(`SwitchAudioSource -s "${previousAudioOutput}" -t output`);
        log.log(`[callSession] Audio output → ${previousAudioOutput}`);
      } else {
        // Fallback — ищем динамики
        const devices = execSync('SwitchAudioSource -a -t output', { encoding: 'utf8' });
        const speakers = devices.split('\n').find(d =>
          d.includes('MacBook') || d.includes('Speaker') || d.includes('Динамик')
        );
        if (speakers) {
          execSync(`SwitchAudioSource -s "${speakers.trim()}" -t output`);
          log.log(`[callSession] Audio output → ${speakers.trim()}`);
        }
      }
      previousAudioOutput = null;
    }
  } catch (err) {
    log.error('[callSession] Audio switch error:', err.message);
  }
}

function mergeChunks(files, outputPath) {
  return new Promise((resolve, reject) => {
    if (files.length === 1) {
      fs.copyFileSync(files[0], outputPath);
      return resolve();
    }

    const listFile = path.join(sessionDir, 'concat_list.txt');
    const listContent = files.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const cmd = `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -ar 16000 -ac 1 -y "${outputPath}"`;

    exec(cmd, (error) => {
      try { fs.unlinkSync(listFile); } catch {}
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
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
  processLastChunksSimple,
};
