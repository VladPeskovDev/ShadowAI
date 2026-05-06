const fs = require('fs');
const path = require('path');
const os = require('os');
const { getOpenAIClient } = require('./openaiClient');
const log = require('./logger');
const { GPT_MODEL, CONTEXT_RECENT_MINUTES, CONTEXT_MAX_TOKENS, TOKEN_ESTIMATE_RATIO } = require('./constants');

// --- Transcript storage ---
let transcript = [];
let cachedSummary = '';
let lastSummaryIndex = 0;

// JSONL backup
const sessionId = Date.now();
const backupDir = path.join(os.tmpdir(), 'shadowai-sessions');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `session_${sessionId}.jsonl`);
let lastBackupIndex = 0;

// Периодический backup каждые 30 сек
setInterval(() => {
  if (transcript.length <= lastBackupIndex) return;

  const newEntries = transcript.slice(lastBackupIndex);
  const lines = newEntries.map(JSON.stringify).join('\n') + '\n';

  fs.appendFile(backupFile, lines, (err) => {
    if (err) log.error('[context] Backup error:', err.message);
  });

  lastBackupIndex = transcript.length;
}, 30000);

// Периодический summary каждые 5 мин
setInterval(() => {
  updateSummary().catch(err => {
    log.error('[context] Auto-summary error:', err.message);
  });
}, 5 * 60 * 1000);

// --- Public API ---

/**
 * Добавить запись в transcript
 * @param {'me'|'them'|'screenshot'|'assistant'} speaker
 * @param {string} text
 */
function addEntry(speaker, text) {
  transcript.push({
    time: Date.now(),
    speaker,
    text,
  });
}

/**
 * Получить transcript
 */
function getTranscript() {
  return transcript;
}

/**
 * Собрать messages для GPT из transcript
 * @param {string} systemPrompt
 * @param {object} options
 * @param {number} [options.recentMinutes=5] - сколько минут хранить дословно
 * @param {number} [options.maxTokensEstimate=4000] - примерный лимит токенов на контекст
 * @returns {Array<{role: string, content: string}>}
 */
function buildContext(systemPrompt, options = {}) {
  const { recentMinutes = CONTEXT_RECENT_MINUTES, maxTokensEstimate = CONTEXT_MAX_TOKENS } = options;

  const messages = [{ role: 'system', content: systemPrompt }];

  if (transcript.length === 0) return messages;

  const cutoff = Date.now() - recentMinutes * 60 * 1000;
  const old = transcript.filter(e => e.time < cutoff && e.speaker !== 'assistant');
  const recent = transcript.filter(e => e.time >= cutoff);

  // Формируем текст контекста
  let contextParts = [];

  // Старая часть — summary (если есть)
  if (old.length > 0 && cachedSummary) {
    contextParts.push(`## Краткое содержание (ранее):\n${cachedSummary}`);
  }

  // Свежая часть — дословно
  if (recent.length > 0) {
    contextParts.push(`## Последние ${recentMinutes} мин диалога:\n${formatTranscript(recent)}`);
  }

  let contextText = contextParts.join('\n\n');

  // Проверяем размер — если слишком большой и нет summary, обрезаем старое
  const estimatedTokens = Math.ceil(contextText.length / TOKEN_ESTIMATE_RATIO);
  if (estimatedTokens > maxTokensEstimate && old.length > 0 && !cachedSummary) {
    contextText = `## Последние ${recentMinutes} мин диалога:\n${formatTranscript(recent)}`;
  }

  if (contextText) {
    messages.push({ role: 'user', content: contextText });
  }

  return messages;
}

/**
 * Обновить summary (вызывается автоматически каждые 5 мин)
 */
async function updateSummary() {
  const recentCutoff = Date.now() - 5 * 60 * 1000;
  const old = transcript.filter(e => e.time < recentCutoff && e.speaker !== 'assistant');

  if (old.length <= lastSummaryIndex + 5) return;

  const textToSummarize = formatTranscript(old.slice(lastSummaryIndex));

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Сожми диалог в 150-200 слов. Сохрани ключевые вопросы, ответы и факты. Пиши кратко.',
        },
        {
          role: 'user',
          content: cachedSummary
            ? `Предыдущее резюме:\n${cachedSummary}\n\nНовая часть диалога:\n${textToSummarize}`
            : textToSummarize,
        },
      ],
      max_tokens: 500,
    });

    cachedSummary = response.choices[0]?.message?.content?.trim() || cachedSummary;
    lastSummaryIndex = old.length;
    log.log('[context] Summary updated');
  } catch (err) {
    log.error('[context] Summary error:', err.message);
  }
}

/**
 * Очистить всё
 */
function clearContext() {
  transcript = [];
  cachedSummary = '';
  lastSummaryIndex = 0;
  lastBackupIndex = 0;
  log.log('[context] Контекст очищен');
}

// --- Helpers ---

function formatTranscript(entries) {
  return entries
    .map(e => {
      const label = speakerLabel(e.speaker);
      const timeStr = new Date(e.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `[${timeStr}] ${label}: ${e.text}`;
    })
    .join('\n');
}

function speakerLabel(speaker) {
  switch (speaker) {
    case 'me': return 'Я';
    case 'them': return 'Собеседник';
    case 'screenshot': return 'Скриншот (OCR)';
    case 'assistant': return 'Ассистент';
    default: return speaker;
  }
}

module.exports = {
  addEntry,
  getTranscript,
  buildContext,
  updateSummary,
  clearContext,
};
