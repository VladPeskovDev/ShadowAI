const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { sendScreenshot  } = require("./modules/screenshot");
const { startRecording, stopRecording } = require("./modules/recorder");
const { clearContext } = require("./utils/context");
const { setOpenAiApiKey, setAudioPrompt, setScreenshotPrompt, getOpenAiApiKey, getAudioPrompt, getScreenshotPrompt,
  getOverlayEffectEnabled, setOverlayEffectEnabled,
  getMicrophoneIndex, setMicrophoneIndex,
  getTelegramBotToken, setTelegramBotToken,
  getTelegramChatId, setTelegramChatId,
  getSendScreenshotsToTelegram, setSendScreenshotsToTelegram, getScreenshotInterval, setScreenshotInterval,  
} = require("./modules/telegram");
const { spawnSync } = require("child_process");
const { createOverlayWindow, toggleOverlayWindow, getOverlayWindow } = require("./core/windows/overlay");
const { toggleSettingsWindow } = require("./core/windows/settings");
const { registerShortcuts } = require("./core/shortcuts/registerShortcuts");
const { loadWhisperModel, isWhisperAvailable } = require("./utils/localWhisper");

let ffmpegPath = require("ffmpeg-static");

if (app.isPackaged) {
  ffmpegPath = ffmpegPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

let overlayEffectEnabled = getOverlayEffectEnabled();

app.whenReady().then(() => {
  createOverlayWindow();

  // Загружаем локальный whisper (если модель есть)
  if (isWhisperAvailable()) {
    loadWhisperModel();
  } else {
    console.log('[main] Whisper model not found — using API fallback. Download ggml-small.bin to models/');
  }

  // Регистрируем шорт каты
  registerShortcuts({
    toggleSettingsWindow,
    toggleOverlayWindow,
    getOverlayEffectEnabled,
    startRecording,
    stopRecording,
    sendScreenshot,
  });
});

app.dock && app.dock.hide();

// Сохранение настроек
ipcMain.on("save-settings", (event, settings) => {
  const { 
    openaiApiKey, audioPrompt, screenshotPrompt,
    overlayEffectEnabled: overlayEnabled, microphoneIndex,
    telegramBotToken, telegramChatId, sendScreenshotsToTelegram,
    screenshotInterval  
  } = settings;

  if (openaiApiKey) setOpenAiApiKey(openaiApiKey);
  if (audioPrompt !== undefined) setAudioPrompt(audioPrompt);
  if (screenshotPrompt !== undefined) setScreenshotPrompt(screenshotPrompt);
  if (typeof overlayEnabled === "boolean") {
    setOverlayEffectEnabled(overlayEnabled);
    overlayEffectEnabled = overlayEnabled;
  }
  if (microphoneIndex) setMicrophoneIndex(microphoneIndex);
  if (telegramBotToken !== undefined) setTelegramBotToken(telegramBotToken);
  if (telegramChatId !== undefined) setTelegramChatId(telegramChatId);
  if (typeof sendScreenshotsToTelegram === "boolean") setSendScreenshotsToTelegram(sendScreenshotsToTelegram);
  if (screenshotInterval !== undefined) setScreenshotInterval(screenshotInterval);  
});

// Загрузка настроек
ipcMain.handle("load-settings", () => ({
  openaiApiKey: getOpenAiApiKey(),
  audioPrompt: getAudioPrompt(),
  screenshotPrompt: getScreenshotPrompt(),
  microphoneIndex: getMicrophoneIndex(),
  overlayEffectEnabled,
  telegramBotToken: getTelegramBotToken(),
  telegramChatId: getTelegramChatId(),
  sendScreenshotsToTelegram: getSendScreenshotsToTelegram(), 
   screenshotInterval: getScreenshotInterval(),
}));

// Отправка текста в оверлей
ipcMain.on("send-overlay-text", (event, text) => {
  const overlayWindow = getOverlayWindow();
  if (overlayWindow) {
    overlayWindow.webContents.send("update-overlay-text", text);
  } else {
    console.warn("[Main] overlayWindow is null!");
  }
});

// Изменение размера оверлея
ipcMain.handle('resize-overlay', (event, { width, height }) => {
  const overlayWindow = getOverlayWindow();
  if (overlayWindow) {
    overlayWindow.setSize(Math.ceil(width), Math.ceil(height));
  }
});

// Список аудио-устройств
ipcMain.handle("list-audio-devices", () => {
  try {
    const result = spawnSync(ffmpegPath, ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
      encoding: 'utf8'
    });

    const stderr = result.stderr || '';
    const lines = stderr.split('\n');

    let isAudio = false;
    const audioDevices = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes("AVFoundation audio devices:")) {
        isAudio = true;
        continue;
      }

      if (trimmed.includes("AVFoundation video devices:")) {
        isAudio = false;
        continue;
      }

      if (isAudio && /^\[AVFoundation indev.*\] \[\d+\]/.test(trimmed)) {
        const cleaned = trimmed.replace(/^.*\[(\d+)\] /, (match, index) => `[${index}] `);
        audioDevices.push(cleaned);
      }
    }
    return audioDevices.length > 0 ? audioDevices : [`Аудиоустройства не найдены.`];
  } catch (e) {
    return [`Ошибка при получении устройств: ${e.message}`];
  }
});

// Открытие внешней ссылки
ipcMain.handle('open-external', async (_event, url) => {
  const { shell } = require('electron');
  await shell.openExternal(url);
});

// Очистка контекста диалога
ipcMain.on('clear-context', () => {
  clearContext();
  ipcMain.emit('log-message', null, {
    type: 'info',
    message: 'Контекст диалога очищен',
  });
});

// Завершение приложения
ipcMain.on("quit-app", () => {
  BrowserWindow.getAllWindows().forEach((win) => win.destroy());
  app.quit();
  app.exit(0);
});

// Обработка логов
ipcMain.on("log-message", (event, log) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => win.webContents.send("log-from-main", log));
});

// Скрытие окна настроек
ipcMain.on('hide-settings', () => {
  const { getSettingsWindow } = require('./core/windows/settings');
  const settingsWindow = getSettingsWindow();
  if (settingsWindow) {
    settingsWindow.hide();
  }
});

// Очистка при выходе
app.on("window-all-closed", () => {});
app.on("will-quit", () => {
  const { globalShortcut } = require("electron");
  globalShortcut.unregisterAll();
});



/*
CommandOrControl+Shift+S – Открыть / Закрыть окно настроек.
CommandOrControl+Left – Отправить скриншот.
CommandOrControl+Enter – В call mode: обработать последние 30 сек. Иначе: начать/остановить запись.
CommandOrControl+Shift+D – Открыть / Закрыть окно overlay.
CommandOrControl+Shift+P – Периодические скриншоты в Telegram (toggle).
CommandOrControl+Shift+C – Call mode (toggle): непрерывная фоновая запись.
*/





