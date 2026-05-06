const screenshot = require('screenshot-desktop');
const { getScreenshotPrompt, getTelegramBotToken, getTelegramChatId, getSendScreenshotsToTelegram } = require('./telegram');
const { ipcMain } = require('electron');
const { sendOverlayText } = require('../utils/overlayMessenger');
const { recognizeTextFromBuffer } = require('../utils/ocr');
const { getOpenAIClient } = require('../utils/openaiClient');
const axios = require('axios');
const FormData = require('form-data');
const { Timer } = require('../utils/timer');
const { optimizeForOcr } = require('../../native');
const { addEntry, buildContext } = require('../utils/context');
const log = require('../utils/logger');
const { GPT_MODEL } = require('../utils/constants');

// Периодические скриншоты
let periodicInterval = null;
let periodicIntervalSeconds = 3;

async function sendScreenshot() {
  const timer = new Timer('СКРИНШОТ');

  try {
    timer.mark('Создание скриншота');
    const buffer = await screenshot({ format: 'png' });

    timer.mark('Оптимизация изображения (Rust)');
    const optimizedBuffer = optimizeForOcr(buffer);
    timer.mark('Оптимизация завершена');

    // Telegram отправка (параллельно) - отправляем ОРИГИНАЛ
    const sendToTelegram = getSendScreenshotsToTelegram();
    const telegramToken = getTelegramBotToken();
    const telegramChatId = getTelegramChatId();

    const telegramPromise = (sendToTelegram && telegramToken && telegramChatId)
      ? sendToTelegramAsync(buffer, telegramToken, telegramChatId, timer)
      : Promise.resolve();

    // OCR (параллельно с Telegram)
    timer.mark('Начало OCR');
    const [_, ocrText] = await Promise.all([
      telegramPromise,
      recognizeTextFromBuffer(optimizedBuffer)
    ]);

    timer.mark('OCR завершен');

    ipcMain.emit('log-message', null, {
      type: 'info',
      message: `OCR завершен. Распознано символов: ${ocrText.length}`,
    });

    if (!ocrText || ocrText.trim() === '') {
      ipcMain.emit('log-message', null, {
        type: 'warning',
        message: 'Tesseract не распознал текст на скриншоте',
      });
      sendOverlayText('Текст на скриншоте не распознан', false);
      timer.end();
      return;
    }

    // Сохраняем OCR в единый контекст
    addEntry('screenshot', ocrText);

    timer.mark('Отправка в GPT');

    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Отправка текста в GPT-4o-mini...',
    });

    const openai = getOpenAIClient();
    const systemPrompt = getScreenshotPrompt() || "Ты полезный ассистент.";
    const messages = buildContext(systemPrompt);

    const response = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages,
      max_tokens: 1500,
    });

    timer.mark('GPT ответил');

    const replyText = response.choices[0]?.message?.content?.trim();

    if (replyText) {
      addEntry('assistant', replyText);
      sendOverlayText(replyText, false);
    }

    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Скриншот успешно обработан.',
    });

    timer.end();
  } catch (error) {
    log.error('Ошибка при отправке скриншота:', error.message);

    ipcMain.emit('log-message', null, {
      type: 'error',
      message: `Ошибка при отправке скриншота: ${error.message}`,
    });

    timer.end();
  }
}

// Вспомогательная функция для Telegram
async function sendToTelegramAsync(buffer, token, chatId, timer) {
  try {
    timer.mark('Telegram: начало отправки');
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', buffer, { filename: 'screenshot.png' });
    formData.append('caption', 'Скриншот');

    await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, formData, {
      headers: formData.getHeaders(),
    });

    timer.mark('Telegram: отправлено');
  } catch (error) {
    log.error('Ошибка Telegram:', error.message);
  }
}

// Запуск периодических скриншотов (только в Telegram)
function startPeriodicScreenshots(intervalSeconds) {
  if (periodicInterval) {
    stopPeriodicScreenshots();
  }

  periodicIntervalSeconds = intervalSeconds || 20;

  log.log(`Запуск периодических скриншотов каждые ${periodicIntervalSeconds}s`);

  ipcMain.emit('log-message', null, {
    type: 'info',
    message: `Периодические скриншоты запущены (каждые ${periodicIntervalSeconds}s)`,
  });

  const telegramToken = getTelegramBotToken();
  const telegramChatId = getTelegramChatId();

  if (!telegramToken || !telegramChatId) {
    log.error('Периодические скриншоты: Telegram не настроен (нет токена или chatId)');
    ipcMain.emit('log-message', null, {
      type: 'error',
      message: 'Периодические скриншоты: настройте Telegram (токен и chatId)',
    });
    return;
  }

  periodicInterval = setInterval(async () => {
    try {
      const buffer = await screenshot({ format: 'png' });
      const timer = new Timer('ПЕРИОДИЧЕСКИЙ СКРИНШОТ');

      await sendToTelegramAsync(buffer, getTelegramBotToken(), getTelegramChatId(), timer);

      timer.end();

      log.log('Периодический скриншот отправлен в Telegram');
    } catch (error) {
      log.error('Ошибка периодического скриншота:', error.message);
    }
  }, periodicIntervalSeconds * 1000);
}

// Остановка периодических скриншотов
function stopPeriodicScreenshots() {
  if (periodicInterval) {
    clearInterval(periodicInterval);
    periodicInterval = null;

    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Периодические скриншоты остановлены',
    });
  }
}

function togglePeriodicScreenshots(intervalSeconds) {
  if (periodicInterval) {
    stopPeriodicScreenshots();
  } else {
    startPeriodicScreenshots(intervalSeconds);
  }
}

module.exports = {
  sendScreenshot,
  startPeriodicScreenshots,
  stopPeriodicScreenshots,
  togglePeriodicScreenshots,
};
