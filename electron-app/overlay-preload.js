const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayBridge', {
  
  // Подписаться на обновление текста в оверлее (теперь получаем объект с text и isStreaming)
  onUpdateText: (callback) =>
    ipcRenderer.on('update-overlay-text', (_, data) => callback(data)),

  // получить команды из main
  onCommand: (callback) =>
    ipcRenderer.on('overlay-command', (_, cmd) => callback(cmd)),

  // Попросить main изменить размер окна
  resizeOverlay: (width, height) =>
    ipcRenderer.invoke('resize-overlay', { width, height }),
});