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
        screenshotInterval?: number; 
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
        screenshotInterval?: number; 
      }>;
      listAudioDevices: () => Promise<string[]>;
      onLogMessage: (callback: (log: { type: 'info' | 'error' | 'warning'; message: string }) => void) => void;
      sendLog: (log: { type: string; message: string }) => void;
      openExternal: (url: string) => void;
      hideSettings: () => void;
      quitApp: () => void;
      clearContext: () => void;
      startCallSession: (metadata: { title: string; description: string; mode: 'interview' | 'translator' | 'meeting' }) => void;
      stopCallSession: () => void;
      getCallSessionStatus: () => Promise<boolean>;
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
  screenshotInterval?: number;

};