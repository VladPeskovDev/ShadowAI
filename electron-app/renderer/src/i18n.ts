type Lang = 'ru' | 'en';

let currentLang: Lang = (localStorage.getItem('lang') as Lang) || 'ru';

const translations: Record<string, Record<Lang, string>> = {
  // HomePage
  'home.startSession': { ru: 'Начать сессию', en: 'Start Session' },
  'home.stopSession': { ru: 'Завершить сессию', en: 'Stop Session' },
  'home.settings': { ru: 'Настройки', en: 'Settings' },
  'home.faq': { ru: 'FAQ', en: 'FAQ' },
  'home.logs': { ru: 'Логи', en: 'Logs' },
  'home.hide': { ru: 'Скрыть', en: 'Hide' },
  'home.exit': { ru: 'Выход', en: 'Exit' },

  // SessionPage
  'session.title': { ru: 'Подготовка к сессии', en: 'Session Setup' },
  'session.mode': { ru: 'Режим', en: 'Mode' },
  'session.interview': { ru: 'Собеседование', en: 'Interview' },
  'session.interviewDesc': { ru: 'Подсказки на вопросы собеседника', en: 'Answer hints for interviewer questions' },
  'session.translator': { ru: 'Переводчик', en: 'Translator' },
  'session.translatorDesc': { ru: 'Перевод + ответы на RU и EN', en: 'Translation + answers in RU and EN' },
  'session.meeting': { ru: 'Встреча', en: 'Meeting' },
  'session.meetingDesc': { ru: 'Запись и summary созвона', en: 'Recording and meeting summary' },
  'session.name': { ru: 'Название', en: 'Title' },
  'session.namePlaceholder': { ru: 'Собес Backend Яндекс', en: 'Backend Interview Google' },
  'session.description': { ru: 'Описание (необязательно)', en: 'Description (optional)' },
  'session.descPlaceholder': { ru: 'Второй этап, технический...', en: 'Second round, technical...' },
  'session.autoVAD': { ru: 'Авто-подсказки', en: 'Auto-hints' },
  'session.autoVADDesc': { ru: 'Автоматически отвечать при паузе собеседника (VAD)', en: 'Auto-respond when interlocutor pauses (VAD)' },
  'session.start': { ru: 'Начать сессию', en: 'Start Session' },
  'session.back': { ru: 'Назад', en: 'Back' },
  'session.untitled': { ru: 'Без названия', en: 'Untitled' },

  // SettingsPage
  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.apiKeyRequired': { ru: 'OpenAI API ключ обязателен!', en: 'OpenAI API key is required!' },
  'settings.saved': { ru: 'Настройки сохранены!', en: 'Settings saved!' },
  'settings.audioPrompt': { ru: 'Системный промпт для аудио', en: 'System prompt for audio' },
  'settings.audioPromptPlaceholder': { ru: 'Ты полезный ассистент...', en: 'You are a helpful assistant...' },
  'settings.audioPromptHint': { ru: 'Этот промпт будет использоваться при обработке голосовых запросов', en: 'This prompt will be used for voice request processing' },
  'settings.screenshotPrompt': { ru: 'Системный промпт для скриншотов', en: 'System prompt for screenshots' },
  'settings.screenshotPromptPlaceholder': { ru: 'Опиши что видишь на скриншоте...', en: 'Describe what you see in the screenshot...' },
  'settings.screenshotPromptHint': { ru: 'Этот промпт будет использоваться при обработке скриншотов', en: 'This prompt will be used for screenshot processing' },
  'settings.microphone': { ru: 'Микрофон', en: 'Microphone' },
  'settings.overlayEffect': { ru: 'Включить эффект overlay', en: 'Enable overlay effect' },
  'settings.telegram': { ru: 'Telegram (опционально)', en: 'Telegram (optional)' },
  'settings.context': { ru: 'Контекст диалога', en: 'Dialog Context' },
  'settings.contextDesc': { ru: 'Диалог сохраняется в памяти (последние 10 пар вопрос-ответ). Очистите контекст для начала новой темы разговора.', en: 'Conversation saved in memory (last 10 Q&A pairs). Clear context to start a new topic.' },
  'settings.contextCleared': { ru: 'Контекст диалога очищен!', en: 'Dialog context cleared!' },
  'settings.clearContext': { ru: 'Очистить контекст', en: 'Clear Context' },
  'settings.screenshotInterval': { ru: 'Интервал периодических скриншотов (секунды)', en: 'Periodic screenshot interval (seconds)' },
  'settings.screenshotIntervalHint': { ru: 'Хоткей: Cmd+Shift+P для старт/стоп периодических скриншотов в Telegram', en: 'Hotkey: Cmd+Shift+P to start/stop periodic screenshots to Telegram' },
  'settings.sendToTelegram': { ru: 'Отправлять скриншоты в Telegram', en: 'Send screenshots to Telegram' },
  'settings.save': { ru: 'Сохранить', en: 'Save' },
  'settings.back': { ru: 'Назад', en: 'Back' },

  // FAQPage
  'faq.title': { ru: 'Горячие клавиши', en: 'Hotkeys' },
  'faq.hotkey': { ru: 'Хоткей', en: 'Hotkey' },
  'faq.action': { ru: 'Действие', en: 'Action' },
  'faq.openSettings': { ru: 'Открыть / скрыть настройки', en: 'Open / hide settings' },
  'faq.showOverlay': { ru: 'Показать / скрыть overlay с ответом', en: 'Show / hide answer overlay' },
  'faq.callMode': { ru: 'Call mode — непрерывная фоновая запись (вкл/выкл)', en: 'Call mode — continuous background recording (on/off)' },
  'faq.cmdEnter': { ru: 'В call mode: отправить контекст в GPT. Иначе: начать/остановить запись', en: 'In call mode: send context to GPT. Otherwise: start/stop recording' },
  'faq.screenshot': { ru: 'Скриншот — OCR + отправка в GPT', en: 'Screenshot — OCR + send to GPT' },
  'faq.periodic': { ru: 'Периодические скриншоты в Telegram (вкл/выкл)', en: 'Periodic Telegram screenshots (on/off)' },
  'faq.modes': { ru: 'Режимы', en: 'Modes' },
  'faq.normalMode': { ru: 'Обычный режим', en: 'Normal mode' },
  'faq.normalModeDesc': { ru: 'Cmd+Enter для записи, повторно для остановки. Whisper расшифрует, GPT ответит в overlay.', en: 'Cmd+Enter to record, again to stop. Whisper transcribes, GPT responds in overlay.' },
  'faq.callModeDesc': { ru: 'Запускается через UI (Начать сессию) или Cmd+Shift+C. Непрерывная запись + транскрипция. Cmd+Enter — подсказка. Стенограмма в ~/Documents/ShadowAI/.', en: 'Start via UI (Start Session) or Cmd+Shift+C. Continuous recording + transcription. Cmd+Enter — hint. Transcript saved to ~/Documents/ShadowAI/.' },
  'faq.screenshotMode': { ru: 'Скриншот', en: 'Screenshot' },
  'faq.screenshotModeDesc': { ru: 'Cmd+Left делает снимок, OCR распознаёт текст, GPT отвечает. Знает контекст разговора.', en: 'Cmd+Left takes screenshot, OCR recognizes text, GPT responds. Knows conversation context.' },
  'faq.toMenu': { ru: 'В меню', en: 'To Menu' },

  // LogPage
  'logs.title': { ru: 'Логи', en: 'Logs' },
  'logs.empty': { ru: 'Пока нет сообщений', en: 'No messages yet' },
  'logs.toMenu': { ru: 'В меню', en: 'To Menu' },

  // ExitPage
  'exit.title': { ru: 'Выход...', en: 'Exiting...' },

  // Overlay
  'overlay.generating': { ru: 'Генерация...', en: 'Generating...' },
  'overlay.waiting': { ru: 'Ожидание...', en: 'Waiting...' },
  'overlay.back': { ru: 'Назад', en: 'Back' },
  'overlay.forward': { ru: 'Вперёд', en: 'Forward' },
  'overlay.latest': { ru: 'Последний', en: 'Latest' },
};

export function t(key: string): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[currentLang] || entry['en'] || key;
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem('lang', lang);
}

export function toggleLang(): Lang {
  const newLang = currentLang === 'ru' ? 'en' : 'ru';
  setLang(newLang);
  return newLang;
}
