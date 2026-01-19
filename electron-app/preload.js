const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');

//API для сохранения/загрузки настроек и логов
contextBridge.exposeInMainWorld('electronAPI', {
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  onLogMessage: (callback) => ipcRenderer.on('log-from-main', (_, data) => callback(data)),
  sendLog: (log) => ipcRenderer.send('log-message', log),
  quitApp: () => ipcRenderer.send('quit-app'),
  listAudioDevices: () => ipcRenderer.invoke('list-audio-devices'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  hideSettings: () => ipcRenderer.send('hide-settings'),
});


