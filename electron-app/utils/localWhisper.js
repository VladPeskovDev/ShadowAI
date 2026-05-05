const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let isLoaded = false;

/**
 * Путь к модели whisper.
 * В dev — ищем в корне проекта: models/ggml-small.bin
 * В production — в ресурсах приложения (asarUnpack)
 */
function getModelPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'models', 'ggml-small.bin');
  }
  return path.join(__dirname, '..', '..', 'models', 'ggml-small.bin');
}

/**
 * Загрузить модель whisper (вызывать один раз при старте)
 */
function loadWhisperModel() {
  if (isLoaded) return true;

  const modelPath = getModelPath();

  if (!fs.existsSync(modelPath)) {
    console.error(`[localWhisper] Model not found: ${modelPath}`);
    console.error('[localWhisper] Download it: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin');
    return false;
  }

  try {
    const { whisperLoadModel } = require('../../native');
    whisperLoadModel(modelPath);
    isLoaded = true;
    console.log('[localWhisper] Model loaded successfully');
    return true;
  } catch (err) {
    console.error('[localWhisper] Failed to load model:', err.message);
    return false;
  }
}

/**
 * Транскрибировать аудиофайл локально
 * @param {string} filePath — путь к WAV/FLAC файлу (16kHz mono)
 * @param {string} [language='ru'] — язык
 * @returns {string|null} — текст или null при ошибке
 */
function transcribeLocal(filePath, language = 'ru') {
  if (!isLoaded) {
    const loaded = loadWhisperModel();
    if (!loaded) return null;
  }

  try {
    const { whisperTranscribe } = require('../../native');
    const text = whisperTranscribe(filePath, language);
    return text && text.trim() !== '' ? text.trim() : null;
  } catch (err) {
    console.error('[localWhisper] Transcription error:', err.message);
    return null;
  }
}

/**
 * Проверить доступен ли локальный whisper
 */
function isWhisperAvailable() {
  const modelPath = getModelPath();
  return fs.existsSync(modelPath);
}

module.exports = {
  loadWhisperModel,
  transcribeLocal,
  isWhisperAvailable,
};
