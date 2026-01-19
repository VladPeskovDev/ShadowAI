import { AppSettings } from './preload.d';

export function saveSettings(settings: AppSettings): void {
  window.electronAPI.saveSettings(settings);
}

export function loadSettings(): Promise<AppSettings> {
  return window.electronAPI.loadSettings();
}

export function listAudioDevices(): Promise<string[]> {
  return window.electronAPI.listAudioDevices();
}

export function openExternal(url: string): void {
  window.electronAPI.openExternal(url);
}

export function hideSettings(): void {
  window.electronAPI.hideSettings();
}

export function quitApp(): void {
  window.electronAPI.quitApp();
}