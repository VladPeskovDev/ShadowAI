const fs = require('fs');
const path = require('path');

let vad = null;
let isReady = false;

// VAD state
let speechActive = false;
let silenceStart = 0;
const SILENCE_THRESHOLD_MS = 1500; // 1.5 сек тишины = триггер

// Callback when speech ends (silence detected after speech)
let onSpeechEnd = null;

/**
 * Инициализировать VAD
 * @param {Function} callback — вызывается при окончании речи (пауза 1.5+ сек)
 */
async function initVAD(callback) {
  onSpeechEnd = callback;

  try {
    const { RealTimeVAD } = require('avr-vad');
    vad = await RealTimeVAD.new({
      model: 'v5',
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      frameSamples: 1536,
    });
    isReady = true;
    console.log('[VAD] Initialized successfully');
  } catch (err) {
    console.error('[VAD] Init error:', err.message);
    isReady = false;
  }
}

/**
 * Обработать аудио-фрейм (Float32Array, 16kHz, 1536 samples)
 * Вызывать непрерывно с аудио данными system audio
 */
async function processAudioFrame(frame) {
  if (!isReady || !vad) return;

  try {
    const result = await vad.processFrame(frame);
    const now = Date.now();

    if (result.isSpeech || result.state === 'SPEECH_START' || result.state === 'SPEECH_CONTINUE') {
      speechActive = true;
      silenceStart = 0;
    } else {
      if (speechActive && silenceStart === 0) {
        // Речь только что закончилась — начинаем отсчёт тишины
        silenceStart = now;
      }

      if (speechActive && silenceStart > 0 && (now - silenceStart) >= SILENCE_THRESHOLD_MS) {
        // Тишина 1.5+ сек после речи — триггер
        speechActive = false;
        silenceStart = 0;

        if (onSpeechEnd) {
          console.log('[VAD] Speech ended — triggering auto-response');
          onSpeechEnd();
        }
      }
    }
  } catch (err) {
    // Тихо игнорируем ошибки обработки фреймов
  }
}

/**
 * Обработать WAV файл — извлечь фреймы и прогнать через VAD
 */
async function processWavFile(filePath) {
  if (!isReady || !vad) return;
  if (!fs.existsSync(filePath)) return;

  try {
    const data = fs.readFileSync(filePath);

    // Пропускаем WAV header (44 bytes), читаем 16-bit PCM
    if (data.length < 46 || data.toString('ascii', 0, 4) !== 'RIFF') return;

    const pcmData = data.slice(44);
    const samples = new Float32Array(Math.floor(pcmData.length / 2));

    for (let i = 0; i < samples.length; i++) {
      const sample = pcmData.readInt16LE(i * 2);
      samples[i] = sample / 32768.0;
    }

    // Разбиваем на фреймы по 1536 samples и прогоняем через VAD
    const frameSize = 1536;
    for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
      const frame = samples.slice(i, i + frameSize);
      await processAudioFrame(frame);
    }
  } catch (err) {
    console.error('[VAD] processWavFile error:', err.message);
  }
}

/**
 * Сбросить состояние VAD
 */
function resetVAD() {
  speechActive = false;
  silenceStart = 0;
}

function isVADReady() {
  return isReady;
}

module.exports = {
  initVAD,
  processAudioFrame,
  processWavFile,
  resetVAD,
  isVADReady,
};
