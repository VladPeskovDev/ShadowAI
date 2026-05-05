const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');

//API для сохранения/загрузки настроек и логов
contextBridge.exposeInMainWorld('electronAPI', {
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  onLogMessage: (callback) => ipcRenderer.on('log-from-main', (_, log) => callback(log)),
  sendLog: (log) => ipcRenderer.send('log-message', log),
  quitApp: () => ipcRenderer.send('quit-app'),
  listAudioDevices: () => ipcRenderer.invoke('list-audio-devices'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  hideSettings: () => ipcRenderer.send('hide-settings'),
  clearContext: () => ipcRenderer.send('clear-context'),
  startCallSession: (metadata) => ipcRenderer.send('start-call-session', metadata),
  stopCallSession: () => ipcRenderer.send('stop-call-session'),
});


