import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSettings, saveSettings, listAudioDevices } from '../ipcBridge';
import { AppSettings } from '../preload.d';
import styles from './SettingsPage.module.css';

const SettingsPage = () => {
  const navigate = useNavigate();
  
  const [settings, setSettings] = useState<AppSettings>({
  openaiApiKey: '',
  audioPrompt: '',
  screenshotPrompt: '',
  overlayEffectEnabled: false,
  microphoneIndex: ':0',
  telegramBotToken: '',
  telegramChatId: '',
  sendScreenshotsToTelegram: false,  
});

  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [openAiStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [telegramStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    loadSettings().then(setSettings);
    listAudioDevices().then(setAudioDevices);
  }, []);

  const handleSave = () => {
    if (!settings.openaiApiKey) {
      alert('❌ OpenAI API ключ обязателен!');
      return;
    }
    
    saveSettings(settings);
    alert('✅ Настройки сохранены!');
    navigate('/');
  };


return (
  <div className={styles.container}>
    <h1 className={styles.heading}>Настройки</h1>

    {/* OpenAI API Key */}
    <div className={styles.formGroup}>
      <label className={styles.label}>
        <strong>OpenAI API Key</strong> <span className={styles.required}>*</span>
      </label>
      <div className={styles.inputWithButton}>
        <input
          type="password"
          placeholder="sk-..."
          value={settings.openaiApiKey}
          onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
          className={`${styles.input} ${openAiStatus === 'valid' ? styles.valid : openAiStatus === 'invalid' ? styles.invalid : ''}`}
        />
      </div>
    </div>

    {/* Audio Prompt */}
    <div className={styles.formGroup}>
      <label className={styles.label}>
        <strong>Системный промпт для аудио</strong>
      </label>
      <textarea
        className={styles.textarea}
        placeholder="Ты полезный ассистент..."
        value={settings.audioPrompt}
        onChange={(e) => setSettings({ ...settings, audioPrompt: e.target.value })}
        rows={3}
      />
      <small className={styles.small}>Этот промпт будет использоваться при обработке голосовых запросов</small>
    </div>

    {/* Screenshot Prompt */}
    <div className={styles.formGroup}>
      <label className={styles.label}>
        <strong>Системный промпт для скриншотов</strong>
      </label>
      <textarea
        className={styles.textarea}
        placeholder="Опиши что видишь на скриншоте..."
        value={settings.screenshotPrompt}
        onChange={(e) => setSettings({ ...settings, screenshotPrompt: e.target.value })}
        rows={3}
      />
      <small className={styles.small}>Этот промпт будет использоваться при обработке скриншотов</small>
    </div>

    {/* Microphone */}
    <div className={styles.formGroup}>
      <label className={styles.label}>
        <strong>Микрофон</strong>
      </label>
      <select
        className={styles.select}
        value={settings.microphoneIndex}
        onChange={(e) => setSettings({ ...settings, microphoneIndex: e.target.value })}
      >
        {audioDevices.map((device, idx) => {
          const match = device.match(/\[(\d+)\]/);
          const deviceIndex = match ? `:${match[1]}` : `:${idx}`;
          return (
            <option key={idx} value={deviceIndex}>
              {device}
            </option>
          );
        })}
      </select>
    </div>

    {/* Overlay Effect */}
    <div className={styles.formGroup}>
      <div className={styles.switchCard}>
        <div className={styles.switchContent}>
          <span className={styles.switchTitle}>Включить эффект overlay</span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={settings.overlayEffectEnabled}
              onChange={(e) => setSettings({ ...settings, overlayEffectEnabled: e.target.checked })}
            />
            <span className={styles.slider}></span>
          </label>
        </div>
      </div>
    </div>

    <hr />

    {/* Telegram (optional) */}
    <h2 className={styles.sectionTitle}>Telegram (опционально)</h2>

    <div className={styles.formGroup}>
      <label className={styles.label}>
        <strong>Telegram Bot Token</strong>
      </label>
      <input
        type="password"
        className={styles.input}
        placeholder="123456:ABC-DEF..."
        value={settings.telegramBotToken || ''}
        onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
      />
      <small className={styles.small}>
      </small>
    </div>

    <div className={styles.formGroup}>
      <label className={styles.label}>
        <strong>Telegram Chat ID</strong>
      </label>
      <div className={styles.inputWithButton}>
        <input
          type="text"
          placeholder="123456789"
          value={settings.telegramChatId || ''}
          onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
          className={`${styles.input} ${telegramStatus === 'valid' ? styles.valid : telegramStatus === 'invalid' ? styles.invalid : ''}`}
        />
        
      </div>
    </div>

    {/* НОВЫЙ ПЕРЕКЛЮЧАТЕЛЬ - ДОБАВЬ СЮДА */}
    <div className={styles.formGroup}>
      <div className={styles.switchCard}>
        <div className={styles.switchContent}>
          <span className={styles.switchTitle}>Отправлять скриншоты в Telegram</span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={settings.sendScreenshotsToTelegram || false}
              onChange={(e) => setSettings({ ...settings, sendScreenshotsToTelegram: e.target.checked })}
            />
            <span className={styles.slider}></span>
          </label>
        </div>
      </div>
    </div>

    <div className={styles.buttons}>
      <button className={`${styles.button} ${styles.saveBtn}`} onClick={handleSave}>
        Сохранить
      </button>
      <button className={styles.button} onClick={() => navigate('/')}>
        Назад
      </button>
    </div>
  </div>
);
};

export default SettingsPage;