const { BrowserWindow } = require('electron');

let overlayWindowRef = null;
let lastText = '⌛ Ожидание ответа...';

// Сохраняем ссылку на окно
function registerOverlayWindow(windowInstance) {
  overlayWindowRef = windowInstance;
}

// Отправляем текст в overlay с поддержкой стриминга
function sendOverlayText(text, isStreaming = true) {
  lastText = text;
  
  //console.log('📤 Отправка в overlay:', { text, isStreaming });
  //console.log('📤 overlayWindowRef exists:', !!overlayWindowRef);
  //console.log('📤 overlayWindowRef.isDestroyed:', overlayWindowRef?.isDestroyed());
  
  if (overlayWindowRef && !overlayWindowRef.isDestroyed()) {
    overlayWindowRef.webContents.send('update-overlay-text', { text, isStreaming });
    //console.log('✅ Отправлено!');
  } else {
    console.warn('[overlayMessenger] overlayWindowRef is null or destroyed');
  }
}

// Возвращаем последний текст
function getLastOverlayText() {
  return lastText;
}

module.exports = {
  registerOverlayWindow,
  sendOverlayText,
  getLastOverlayText,
};