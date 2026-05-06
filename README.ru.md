# ShadowAI

**[English](README.md)** | **[Русский](#возможности)**

Real-time AI-ассистент для созвонов, собеседований и встреч. Невидим при шеринге экрана.

Локальное распознавание речи (whisper.cpp, Metal GPU), GPT-4o-mini streaming, два аудио-потока (микрофон + системный звук), автоматическая стенограмма.

## Почему ShadowAI

| | Cluely / LockedIn | ShadowAI |
|---|---|---|
| Транскрибация | Их сервер | Локально (whisper.cpp, Metal GPU) |
| Задержка | 5-15 сек | ~2-3 сек |
| Приватность | Аудио уходит на их сервера | Аудио не покидает машину |
| Стоимость | $20-100/мес | Бесплатно (только OpenAI API ключ) |
| Screen share | Некоторые детектятся | Невидим (`setContentProtection`) |
| Стенограмма | Редко | Автоматически в ~/Documents/ShadowAI/ |
| Open source | Нет | Да |

## Возможности

- **Call mode** — непрерывная фоновая запись, ручной триггер (Cmd+Enter) или авто-триггер (VAD)
- **3 режима** — Собеседование (подсказки), Переводчик (RU/EN), Встреча (summary)
- **Два аудио-потока** — микрофон (вы) + системный звук через BlackHole (собеседник)
- **Локальный whisper.cpp** — модель medium, Metal GPU, ~2-3 сек на 10 сек аудио
- **Невидимый overlay** — glassmorphism, авто-размер, скрыт при screen share
- **Автоматическая стенограмма** — полная транскрипция сессии в `~/Documents/ShadowAI/`
- **Умный контекст** — GPT знает всю историю разговора
- **SKIP-фильтр** — GPT не отвечает на "ага", "понятно", тишину
- **Фильтр галлюцинаций** — определяет и игнорирует артефакты whisper
- **Скриншот + OCR** — Tesseract.js + Rust оптимизатор, общий контекст с аудио
- **Telegram** — опциональная пересылка скриншотов
- **Двуязычный интерфейс** — переключение RU/EN в приложении

## Технологии

- **Electron** + **React** + **Vite** — десктопное приложение
- **Rust (napi-rs)** — биндинги whisper.cpp (Metal GPU), оптимизация изображений
- **whisper.cpp** — локальное распознавание речи, модель medium (1.5 ГБ)
- **GPT-4o-mini** — стриминг ответов
- **ffmpeg** — захват аудио (микрофон + BlackHole)
- **Silero VAD** (avr-vad) — детекция голосовой активности для авто-триггера
- **Tesseract.js** — OCR для скриншотов

## Требования

- macOS 13+ (Apple Silicon: M1, M2, M3, M4)
- Node.js 18+
- Rust toolchain (для сборки native addon)
- cmake (`brew install cmake`)
- switchaudio-osx (`brew install switchaudio-osx`) — автопереключение аудио-выхода
- OpenAI API ключ

## Установка

### 1. Клонирование и установка зависимостей

```bash
git clone git@github.com:VladPeskovDev/ShadowAI.git
cd ShadowAI
npm install
cd electron-app/renderer && npm install && cd ../..
```

### 2. Сборка native addon (Rust)

```bash
brew install cmake switchaudio-osx
cd native && npm run build && cd ..
```

### 3. Скачивание модели whisper

```bash
mkdir -p models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin -o models/ggml-medium.bin
```

Размер ~1.5 ГБ. Для быстрой но менее точной работы можно использовать `ggml-small.bin` (466 МБ).

### 4. (Опционально) Установка BlackHole для захвата системного звука

```bash
brew install --cask blackhole-2ch
```

Настройка Multi-Output Device:
1. Откройте Audio MIDI Setup (`/System/Applications/Utilities/Audio MIDI Setup.app`)
2. Нажмите "+" -> Создать многовыходное устройство
3. Отметьте оба: динамики MacBook + BlackHole 2ch
4. Приложение само переключает аудио-выход при старте/стопе сессии

Без BlackHole записывается только микрофон.

### 5. Ввод OpenAI API ключа

Запустите приложение, откройте Настройки, введите OpenAI API ключ.

## Запуск

### Режим разработки

```bash
npm run dev
```

### Продакшн сборка

```bash
npm run build:renderer
npm start
```

## Горячие клавиши

| Хоткей | Действие |
|--------|----------|
| `Cmd+Shift+S` | Открыть / скрыть настройки |
| `Cmd+Shift+D` | Показать / скрыть overlay |
| `Cmd+Shift+C` | Включить/выключить call mode (быстрый старт без UI) |
| `Cmd+Enter` | В call mode: обработать последние 30 сек. Иначе: начать/остановить запись |
| `Cmd+Left` | Скриншот — OCR + GPT |
| `Cmd+Shift+P` | Периодические скриншоты в Telegram (вкл/выкл) |

## Режимы сессии

### Собеседование
AI-ассистент для технических собеседований. Развёрнутые ответы (8-15 предложений) с примерами кода. Понимает контекст разговора.

### Переводчик
Для созвонов с англоязычной командой. Показывает перевод + предложенный ответ на EN и RU.

### Встреча
Записывает и резюмирует: текущая тема, решения, TODO, открытые вопросы.

## Как это работает

```
Старт сессии
  |
  +--> Микрофон (ffmpeg) --> чанки 10с --> whisper --> стенограмма "Я: ..."
  |                                                        |
  +--> BlackHole (ffmpeg) --> чанки 10с --> whisper --> стенограмма "Собеседник: ..."
  |                                                        |
  +--> VAD (если авто-режим) --> пауза? ---------------+   |
  |                                                    |   |
  |    Cmd+Enter (ручной) ----------+                  |   |
  |                                 |                  |   |
  |                                 v                  v   |
  |                           buildContext() <--------------+
  |                                 |
  |                                 v
  |                           GPT-4o-mini (streaming)
  |                                 |
  |                            "SKIP"? --> игнор
  |                                 |
  |                                 v
  |                           Overlay (невидим при screen share)
  |
  +--> Файл стенограммы: ~/Documents/ShadowAI/дата_название.md
```

## Структура проекта

```
electron-app/
  main.js                  - Главный процесс Electron, IPC
  preload.js               - Мост между main и renderer
  core/
    shortcuts/             - Глобальные горячие клавиши
    windows/               - Окна: overlay + настройки
  modules/
    callSession.js         - Call mode: запись, транскрибация, VAD, GPT
    recorder.js            - Простой режим записи (Cmd+Enter без сессии)
    screenshot.js          - Скриншот + OCR + GPT
    telegram.js            - Хранение настроек + интеграция с Telegram
  utils/
    context.js             - Единый transcript, buildContext(), авто-summary
    localWhisper.js        - Обёртка локального whisper.cpp
    vad.js                 - Детекция голосовой активности (Silero)
    sessionPrompts.js      - Системные промпты для режимов
    openaiClient.js        - Клиент OpenAI
    overlayMessenger.js    - Коммуникация с overlay
  renderer/
    src/
      i18n.ts              - Интернационализация (RU/EN)
      pages/
        HomePage.tsx        - Главное меню
        SessionPage.tsx     - Настройка сессии (режим, название, VAD)
        SettingsPage.tsx    - API ключи, промпты, выбор микрофона
        FAQPage.tsx         - Справка по горячим клавишам
native/
  src/lib.rs               - Rust addon: оптимизация изображений + whisper биндинги
  Cargo.toml               - Rust зависимости
models/
  ggml-medium.bin          - Модель Whisper (не в git)
```

## Лицензия

MIT
