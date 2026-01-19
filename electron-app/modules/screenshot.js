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

async function sendScreenshot() {
  const timer = new Timer('СКРИНШОТ');
  
  try {
    timer.mark('Создание скриншота');
    const buffer = await screenshot({ format: 'png' });

    // НОВОЕ: Оптимизация изображения через Rust
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

    timer.mark('Отправка в GPT');
    
    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Отправка текста в GPT-4o-mini...',
    });
    
    const openai = getOpenAIClient();
    
    // Системный промпт из настроек
    const systemPrompt = getScreenshotPrompt() || "Ты полезный ассистент.";
    
    // User message - только OCR текст
    const userMessage = `Распознанный текст со скриншота:\n\n${ocrText}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 1500,
    });

    timer.mark('GPT ответил');
    
    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Скриншот успешно обработан.',
    });
    
    const replyText = response.choices[0]?.message?.content?.trim();
    
    if (replyText) {
      sendOverlayText(replyText, false);
    }
    
    timer.end();
  } catch (error) {
    console.error('Ошибка при отправке скриншота:', error.message);
    
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
    formData.append('caption', '📸 Скриншот');

    await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, formData, {
      headers: formData.getHeaders(),
    });
    
    timer.mark('Telegram: отправлено');
  } catch (error) {
    console.error('Ошибка Telegram:', error.message);
  }
}

module.exports = { sendScreenshot };




/*

 const screenshot = require('screenshot-desktop');
const { getScreenshotPrompt, getTelegramBotToken, getTelegramChatId, getSendScreenshotsToTelegram } = require('./telegram');
const { ipcMain } = require('electron');
const { sendOverlayText } = require('../utils/overlayMessenger');
const { recognizeTextFromBuffer } = require('../utils/ocr');
const { getOpenAIClient } = require('../utils/openaiClient');
const axios = require('axios');
const FormData = require('form-data');
const { Timer } = require('../utils/timer');

async function sendScreenshot() {
  const timer = new Timer('СКРИНШОТ');
  
  try {
    timer.mark('Создание скриншота');
    const buffer = await screenshot({ format: 'png' });

    // Telegram отправка (параллельно)
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
      recognizeTextFromBuffer(buffer)
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
      sendOverlayText('⚠️ Текст на скриншоте не распознан', false);
      timer.end();
      return;
    }

    timer.mark('Отправка в GPT');
    
    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Отправка текста в GPT-4o-mini...',
    });
    
    const openai = getOpenAIClient();
    
    // Системный промпт из настроек
    const systemPrompt = getScreenshotPrompt() || "Ты полезный ассистент.";
    
    // User message - только OCR текст
    const userMessage = `Распознанный текст со скриншота:\n\n${ocrText}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 1500,
    });

    timer.mark('GPT ответил');
    
    ipcMain.emit('log-message', null, {
      type: 'info',
      message: 'Скриншот успешно обработан.',
    });
    
    const replyText = response.choices[0]?.message?.content?.trim();
    
    if (replyText) {
      sendOverlayText(replyText, false);
    }
    
    timer.end();
  } catch (error) {
    console.error('❌ Ошибка при отправке скриншота:', error.message);
    
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
    formData.append('caption', '📸 Скриншот');

    await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, formData, {
      headers: formData.getHeaders(),
    });
    
    timer.mark('Telegram: отправлено');
  } catch (error) {
    console.error('Ошибка Telegram:', error.message);
  }
}

module.exports = { sendScreenshot };  */