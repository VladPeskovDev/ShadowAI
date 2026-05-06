module.exports = {
  // LLM
  GPT_MODEL: 'gpt-4o-mini',

  // Recording
  RECORDING_MAX_DURATION: 55,    // секунд, максимальная длительность записи
  CHUNK_DURATION: 10,            // секунд, длительность одного чанка
  MAX_CHUNKS: 12,                // максимум чанков в ring buffer (2 мин)
  PROCESS_CHUNKS: 3,             // сколько чанков склеивать при ручном триггере

  // Audio
  SAMPLE_RATE: 16000,            // Hz, формат для whisper
  SILENCE_RMS_THRESHOLD: 0.01,   // RMS ниже = тишина

  // Context
  CONTEXT_RECENT_MINUTES: 5,     // минут дословного контекста
  CONTEXT_MAX_TOKENS: 4000,      // примерный лимит токенов
  TOKEN_ESTIMATE_RATIO: 3.5,     // символов на токен (приблизительно)
  MAX_HISTORY_PAIRS: 10,         // пар вопрос-ответ в контексте

  // VAD
  VAD_SILENCE_THRESHOLD_MS: 1500, // мс тишины для авто-триггера
  VAD_POSITIVE_THRESHOLD: 0.5,
  VAD_NEGATIVE_THRESHOLD: 0.35,
  VAD_FRAME_SAMPLES: 1536,

  // BlackHole
  BLACKHOLE_DEVICE: 'BlackHole 2ch',
};
