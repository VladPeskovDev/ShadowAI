# ShadowAI

**[English](#features)** | **[Русский](README.ru.md)**

Real-time AI-assistant for calls, interviews and meetings. Invisible during screen share.

Local speech recognition (whisper.cpp, Metal GPU), GPT-4o-mini streaming, two audio streams (mic + system audio), auto-transcription to file.

## Why ShadowAI

| | Cluely / LockedIn | ShadowAI |
|---|---|---|
| Transcription | Their server | Local (whisper.cpp, Metal GPU) |
| Latency | 5-15 sec | ~2-3 sec |
| Privacy | Audio goes to their servers | Audio never leaves your machine |
| Cost | $20-100/mo | Free (only OpenAI API key) |
| Screen share | Some detected | Invisible (`setContentProtection`) |
| Transcript | Rarely | Auto, saved to ~/Documents/ShadowAI/ |
| Open source | No | Yes |

## Features

- **Call mode** - continuous background recording, manual trigger (Cmd+Enter) or auto-trigger (VAD)
- **3 modes** - Interview (answer hints), Translator (RU/EN), Meeting (summary)
- **Two audio streams** - mic (you) + system audio via BlackHole (interlocutor)
- **Local whisper.cpp** - medium model, Metal GPU, ~2-3 sec per 10 sec audio
- **Invisible overlay** - glassmorphism, auto-resize, hidden from screen share
- **Auto-transcription** - full session transcript saved to `~/Documents/ShadowAI/`
- **Smart context** - GPT knows the entire conversation history
- **SKIP filter** - GPT doesn't respond to "ok", "got it", silence
- **Hallucination filter** - detects and ignores whisper artifacts
- **Screenshot + OCR** - Tesseract.js + Rust image optimizer, shared context with audio
- **Telegram** - optional screenshot forwarding

## Tech Stack

- **Electron** + **React** + **Vite** - desktop app
- **Rust (napi-rs)** - whisper.cpp bindings (Metal GPU), image optimization
- **whisper.cpp** - local speech recognition, medium model (1.5 GB)
- **GPT-4o-mini** - streaming responses
- **ffmpeg** - audio capture (mic + BlackHole)
- **Silero VAD** (avr-vad) - voice activity detection for auto-trigger
- **Tesseract.js** - OCR for screenshots

## Requirements

- macOS 13+ (Apple Silicon: M1, M2, M3, M4)
- Node.js 18+
- Rust toolchain (for building native addon)
- cmake (`brew install cmake`)
- switchaudio-osx (`brew install switchaudio-osx`) - auto-switches audio output on session start/stop
- OpenAI API key

## Installation

### 1. Clone and install dependencies

```bash
git clone git@github.com:VladPeskovDev/ShadowAI.git
cd ShadowAI
npm install
cd electron-app/renderer && npm install && cd ../..
```

### 2. Build native addon (Rust)

```bash
brew install cmake switchaudio-osx
cd native && npm run build && cd ..
```

### 3. Download whisper model

```bash
mkdir -p models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin -o models/ggml-medium.bin
```

This is ~1.5 GB. For faster but lower quality, use `ggml-small.bin` (466 MB).

### 4. (Optional) Install BlackHole for system audio capture

```bash
brew install --cask blackhole-2ch
```

Then configure Multi-Output Device:
1. Open Audio MIDI Setup (`/System/Applications/Utilities/Audio MIDI Setup.app`)
2. Click "+" -> Create Multi-Output Device
3. Check both: MacBook speakers + BlackHole 2ch
4. App switches audio output automatically on session start/stop

Without BlackHole, only your microphone is captured.

### 5. Set OpenAI API key

Launch the app, go to Settings, enter your OpenAI API key.

## Running

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build:renderer
npm start
```

## Hotkeys

| Hotkey | Action |
|--------|--------|
| `Cmd+Shift+S` | Open / hide settings |
| `Cmd+Shift+D` | Show / hide overlay |
| `Cmd+Shift+C` | Toggle call mode (quick start without UI) |
| `Cmd+Enter` | In call mode: process last 30 sec. Otherwise: start/stop recording |
| `Cmd+Left` | Screenshot - OCR + GPT |
| `Cmd+Shift+P` | Periodic screenshots to Telegram (toggle) |

## Session Modes

### Interview
AI assistant for technical interviews. Provides detailed answers (8-15 sentences) with code examples. Understands conversation context.

### Translator
For calls with English-speaking teams. Shows translation + suggested response in both EN and RU.

### Meeting
Records and summarizes: current topic, decisions, TODOs, open questions.

## How It Works

```
Session start
  |
  +--> Mic (ffmpeg) --> 10s chunks --> whisper --> transcript "Me: ..."
  |                                                    |
  +--> BlackHole (ffmpeg) --> 10s chunks --> whisper --> transcript "Them: ..."
  |                                                    |
  +--> VAD (if auto mode) --> pause detected? ----+    |
  |                                               |    |
  |    Cmd+Enter (manual) ---------+              |    |
  |                                |              |    |
  |                                v              v    |
  |                          buildContext() <-----------+
  |                                |
  |                                v
  |                          GPT-4o-mini (streaming)
  |                                |
  |                           "SKIP"? --> ignore
  |                                |
  |                                v
  |                          Overlay (invisible on screen share)
  |
  +--> Transcript file: ~/Documents/ShadowAI/date_title.md
```

## Project Structure

```
electron-app/
  main.js                  - Electron main process, IPC
  preload.js               - Bridge between main and renderer
  core/
    shortcuts/             - Global hotkeys
    windows/               - Overlay + settings windows
  modules/
    callSession.js         - Call mode: recording, transcription, VAD, GPT
    recorder.js            - Simple recording mode (Cmd+Enter without session)
    screenshot.js          - Screenshot + OCR + GPT
    telegram.js            - Settings storage + Telegram integration
  utils/
    context.js             - Unified transcript, buildContext(), auto-summary
    localWhisper.js        - Local whisper.cpp wrapper
    vad.js                 - Voice activity detection (Silero)
    sessionPrompts.js      - System prompts for Interview/Translator/Meeting
    openaiClient.js        - OpenAI client
    overlayMessenger.js    - Overlay communication
  renderer/
    src/pages/
      HomePage.tsx         - Main menu
      SessionPage.tsx      - Session setup (mode, title, VAD toggle)
      SettingsPage.tsx     - API keys, prompts, mic selection
      FAQPage.tsx          - Hotkeys reference
native/
  src/lib.rs               - Rust addon: image optimization + whisper bindings
  Cargo.toml               - Rust dependencies
models/
  ggml-medium.bin          - Whisper model (not in git)
```

## License

MIT
