const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Дефолтные настройки
const defaultSettings = {
  openaiApiKey: '',
  audioPrompt: '',
  screenshotPrompt: '',
  overlayEffectEnabled: false,
  microphoneIndex: ':0',
  telegramBotToken: '',
  telegramChatId: '',
  sendScreenshotsToTelegram: false,  
  screenshotInterval: 30, 
};

// Загружаем настройки из файла (или создаём файл, если его нет)
function loadSettings() {
  try {
    if (!fs.existsSync(settingsPath)) {
      saveSettings(defaultSettings);
      return defaultSettings;
    }

    const data = fs.readFileSync(settingsPath, 'utf-8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (error) {
    console.error('❌ Ошибка при загрузке настроек:', error);
    return defaultSettings;
  }
}

// Сохраняем настройки в JSON-файл
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Ошибка при сохранении настроек:', error);
  }
}

// Получаем текущие настройки
const settings = loadSettings();

// Геттеры
function getOpenAiApiKey() {
  return settings.openaiApiKey || '';
}

function getAudioPrompt() {
  return settings.audioPrompt || '';
}

function getScreenshotPrompt() {
  return settings.screenshotPrompt || '';
}

function getMicrophoneIndex() {
  return settings.microphoneIndex || ':0';
}

function getOverlayEffectEnabled() {
  return settings.overlayEffectEnabled || false;
}

function getTelegramBotToken() {
  return settings.telegramBotToken || '';
}

function getTelegramChatId() {
  return settings.telegramChatId || '';
}

function getSendScreenshotsToTelegram() {  // <- НОВОЕ
  return settings.sendScreenshotsToTelegram || false;
}

// Сеттеры (обновляют JSON-файл)
function setOpenAiApiKey(value) {
  settings.openaiApiKey = value;
  saveSettings(settings);
}

function setAudioPrompt(value) {
  settings.audioPrompt = value;
  saveSettings(settings);
}

function setScreenshotPrompt(value) {
  settings.screenshotPrompt = value;
  saveSettings(settings);
}

function setMicrophoneIndex(value) {
  settings.microphoneIndex = value;
  saveSettings(settings);
}

function setOverlayEffectEnabled(value) {
  settings.overlayEffectEnabled = value;
  saveSettings(settings);
}

function setTelegramBotToken(value) {
  settings.telegramBotToken = value;
  saveSettings(settings);
}

function setTelegramChatId(value) {
  settings.telegramChatId = value;
  saveSettings(settings);
}

function setSendScreenshotsToTelegram(value) {  // <- НОВОЕ
  settings.sendScreenshotsToTelegram = value;
  saveSettings(settings);
}

function getScreenshotInterval() {
  return settings.screenshotInterval || 30;
}

function setScreenshotInterval(value) {
  settings.screenshotInterval = value;
  saveSettings(settings);
}

module.exports = {
  getOpenAiApiKey,
  getAudioPrompt,
  getScreenshotPrompt,
  getMicrophoneIndex,
  getOverlayEffectEnabled,
  getTelegramBotToken,
  getTelegramChatId,
  getSendScreenshotsToTelegram, 
  setOpenAiApiKey,
  setAudioPrompt,
  setScreenshotPrompt,
  setMicrophoneIndex,
  setOverlayEffectEnabled,
  setTelegramBotToken,
  setTelegramChatId,
  setSendScreenshotsToTelegram,  
  getScreenshotInterval,     
  setScreenshotInterval,
};