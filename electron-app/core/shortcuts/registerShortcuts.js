const { globalShortcut, ipcMain } = require("electron");

function registerShortcuts({ toggleSettingsWindow, toggleOverlayWindow, getOverlayEffectEnabled }) {
  // Импорты внутри функции (после app.ready)
  const { sendScreenshot, togglePeriodicScreenshots } = require("../../modules/screenshot");
  const { startRecording, stopRecording } = require("../../modules/recorder");
  const { showOverlayEffect } = require("../../utils/overlayEffect");
  const { getScreenshotInterval } = require('../../modules/telegram');
  
  let isRecording = false;

  globalShortcut.register("CommandOrControl+Shift+S", toggleSettingsWindow);

  // Отправка скриншота
  globalShortcut.register("CommandOrControl+Left", () => {
    sendScreenshot(); 
    showOverlayEffect(getOverlayEffectEnabled());
  });

  // Начать/остановить запись аудио
  globalShortcut.register("CommandOrControl+Enter", async () => {
    ipcMain.emit("log-message", null, {
      type: "info",
      message: isRecording ? "⏹ Остановка записи" : "▶️ Начало записи",
    });

    if (isRecording) {
      showOverlayEffect(getOverlayEffectEnabled());
      await stopRecording();
    } else {
      await startRecording();
    }

    isRecording = !isRecording;
    showOverlayEffect(getOverlayEffectEnabled());
  });

  // Показать/скрыть окно оверлея
  globalShortcut.register("CommandOrControl+Shift+D", toggleOverlayWindow);

  // Периодические скриншоты (toggle)
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    const interval = getScreenshotInterval();
    togglePeriodicScreenshots(interval);
  });
}

module.exports = { registerShortcuts };