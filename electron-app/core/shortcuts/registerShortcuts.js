const { globalShortcut, ipcMain } = require("electron");

function registerShortcuts({ toggleSettingsWindow, toggleOverlayWindow, getOverlayEffectEnabled }) {
  // Импорты внутри функции (после app.ready)
  const { sendScreenshot, togglePeriodicScreenshots } = require("../../modules/screenshot");
  const { startRecording, stopRecording } = require("../../modules/recorder");
  const { toggleCallSession, isCallSessionActive, processLastChunksSimple } = require("../../modules/callSession");
  const { showOverlayEffect } = require("../../utils/overlayEffect");
  const { getScreenshotInterval } = require('../../modules/telegram');

  let isRecording = false;

  globalShortcut.register("CommandOrControl+Shift+S", toggleSettingsWindow);

  // Отправка скриншота
  globalShortcut.register("CommandOrControl+Left", () => {
    sendScreenshot();
    showOverlayEffect(getOverlayEffectEnabled());
  });

  // Cmd+Enter — умный: в call mode → обработать последние 30 сек, иначе → старая запись
  globalShortcut.register("CommandOrControl+Enter", async () => {
    if (isCallSessionActive()) {
      // Call mode — берём последние 30 сек, whisper, GPT
      ipcMain.emit("log-message", null, {
        type: "info",
        message: "Обработка последних 30 сек...",
      });
      showOverlayEffect(getOverlayEffectEnabled());
      await processLastChunksSimple();
    } else {
      // Обычный режим — start/stop запись
      ipcMain.emit("log-message", null, {
        type: "info",
        message: isRecording ? "Остановка записи" : "Начало записи",
      });

      if (isRecording) {
        showOverlayEffect(getOverlayEffectEnabled());
        await stopRecording();
      } else {
        await startRecording();
      }

      isRecording = !isRecording;
      showOverlayEffect(getOverlayEffectEnabled());
    }
  });

  // Показать/скрыть окно оверлея
  globalShortcut.register("CommandOrControl+Shift+D", toggleOverlayWindow);

  // Периодические скриншоты (toggle)
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    const interval = getScreenshotInterval();
    togglePeriodicScreenshots(interval);
  });

  // Call session — непрерывная запись (toggle)
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    const active = toggleCallSession();
    showOverlayEffect(getOverlayEffectEnabled());
    ipcMain.emit("log-message", null, {
      type: "info",
      message: active ? "Call mode ON — запись идёт" : "Call mode OFF",
    });
  });
}

module.exports = { registerShortcuts };
