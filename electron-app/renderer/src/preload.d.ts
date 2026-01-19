export {};

declare global {
  interface Window {
    electronAPI: {
      saveSettings: (settings: {
        openaiApiKey: string;
        audioPrompt: string;
        screenshotPrompt: string;
        overlayEffectEnabled: boolean;
        microphoneIndex: string;
        telegramBotToken?: string;
        telegramChatId?: string;
        sendScreenshotsToTelegram?: boolean;
      }) => void;
      loadSettings: () => Promise<{
        openaiApiKey: string;
        audioPrompt: string;
        screenshotPrompt: string;
        overlayEffectEnabled: boolean;
        microphoneIndex: string;
        telegramBotToken?: string;
        telegramChatId?: string;
        sendScreenshotsToTelegram?: boolean;
      }>;
      listAudioDevices: () => Promise<string[]>;
      onLogMessage: (callback: (log: { type: string; message: string }) => void) => void;
      sendLog: (log: { type: string; message: string }) => void;
      openExternal: (url: string) => void;
      hideSettings: () => void;
      quitApp: () => void;
    };

    overlayBridge?: {
      onUpdateText: (callback: (data: { text: string; isStreaming: boolean }) => void) => void;  
      onCommand?: (callback: (cmd: string) => void) => void;
      resizeOverlay: (width: number, height: number) => Promise<void>;
    };
  }
}

export type AppSettings = {
  openaiApiKey: string;
  audioPrompt: string;
  screenshotPrompt: string;
  overlayEffectEnabled: boolean;
  microphoneIndex: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  sendScreenshotsToTelegram?: boolean;
};