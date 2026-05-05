const fs = require("fs");
const os = require("os");
const path = require("path");
const { getAudioPrompt } = require("./telegram");
const { ipcMain } = require("electron");
const { getOpenAIClient } = require("../utils/openaiClient");
const { sendOverlayText } = require("../utils/overlayMessenger");
const { Timer } = require("../utils/timer");
const { addEntry, buildContext } = require("../utils/context");

const ffmpegPath = require("ffmpeg-static").replace("app.asar", "app.asar.unpacked");
const tempDir = path.join(os.tmpdir(), "hack-sobes-recordings");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

let recordProcess = null;
let recordingFilePath = null;

/**
 *  запись аудио (55 сек, mono, 16kHz)
 */
async function startRecording() {
  const { getMicrophoneIndex } = require("./telegram");
  const micIndex = getMicrophoneIndex() || ":0";

  const timestamp = Date.now();
  recordingFilePath = path.join(tempDir, `recording_${timestamp}.flac`);

  const { exec } = require("child_process");
  const platform = os.platform();
  let cmd;

  if (platform === "darwin") {
    cmd = `"${ffmpegPath}" -f avfoundation -i "${micIndex}" -t 55 -ar 16000 -ac 1 "${recordingFilePath}"`;
  } else if (platform === "win32") {
    cmd = `"${ffmpegPath}" -f dshow -i audio="${micIndex}" -t 55 -ar 16000 -ac 1 "${recordingFilePath}"`;
  } else {
    cmd = `"${ffmpegPath}" -f alsa -i "${micIndex}" -t 55 -ar 16000 -ac 1 "${recordingFilePath}"`;
  }

  recordProcess = exec(cmd, (error, stdout, stderr) => {
    if (error && !error.killed) {
      console.error("[recorder] Ошибка записи:", error);
      ipcMain.emit("log-message", null, {
        type: "error",
        message: `Ошибка записи: ${error.message}`,
      });
    }
  });
}

/**
 * Останавливает запись и обрабатывает аудио
 */
async function stopRecording() {
  if (!recordProcess) {
    console.warn("[recorder] Нет активной записи");
    return;
  }

  recordProcess.kill("SIGTERM");
  recordProcess = null;

  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!fs.existsSync(recordingFilePath) || fs.statSync(recordingFilePath).size === 0) {
    console.error("[recorder] Файл записи пустой или не создан");
    ipcMain.emit("log-message", null, {
      type: "error",
      message: "Файл записи пустой",
    });
    return;
  }

  await processAudioWithOpenAI(recordingFilePath);

  try {
    fs.unlinkSync(recordingFilePath);
  } catch (err) {
    console.warn("[recorder] Не удалось удалить временный файл:", err);
  }
}

/**
 * Обработка аудио через OpenAI API со СТРИМИНГОМ
 */
async function processAudioWithOpenAI(filePath) {
  const timer = new Timer('АУДИО');

  try {
    const openai = getOpenAIClient();

    // Шаг 1: Транскрибация через Whisper
    timer.mark('Начало транскрибации');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
      language: "ru",
    });

    timer.mark('Транскрибация завершена');
    const transcribedText = transcription.text;

    if (!transcribedText || transcribedText.trim() === '') {
      ipcMain.emit("log-message", null, {
        type: "warning",
        message: "Whisper не распознал текст из аудио.",
      });
      timer.end();
      return null;
    }

    ipcMain.emit("log-message", null, {
      type: "info",
      message: `Распознано: "${transcribedText}"`,
    });

    // Шаг 2: Сохраняем в transcript и строим контекст
    addEntry('me', transcribedText);

    const audioPrompt = getAudioPrompt() || "Ты полезный ассистент.";
    const messages = buildContext(audioPrompt);

    timer.mark('Начало стриминга GPT');

    // Шаг 3: Отправка в GPT с контекстом
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
    });

    let fullResponse = '';
    let isFirstChunk = true;
    let chunkCount = 0;

    const FAST_CHUNKS = 10;
    const CHUNKS_PER_UPDATE_FAST = 1;
    const CHUNKS_PER_UPDATE_SLOW = 3;

    let buffer = '';
    let bufferCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';

      if (content) {
        if (isFirstChunk) {
          timer.mark('Первый chunk получен');
          isFirstChunk = false;
        }

        fullResponse += content;
        buffer += content;
        bufferCount++;
        chunkCount++;

        const chunksPerUpdate = chunkCount <= FAST_CHUNKS
          ? CHUNKS_PER_UPDATE_FAST
          : CHUNKS_PER_UPDATE_SLOW;

        if (bufferCount >= chunksPerUpdate) {
          sendOverlayText(fullResponse, true);
          buffer = '';
          bufferCount = 0;
          if (chunkCount <= 50) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
    }

    if (buffer) {
      sendOverlayText(fullResponse, true);
    }

    timer.mark('Стриминг завершен');

    // Сохраняем ответ в transcript
    addEntry('assistant', fullResponse);

    sendOverlayText(fullResponse, false);

    timer.end();

    return fullResponse;

  } catch (err) {
    console.error("[recorder] processAudioWithOpenAI error:", err);

    ipcMain.emit("log-message", null, {
      type: "error",
      message: `Ошибка OpenAI: ${err.message}`,
    });

    timer.end();
    return null;
  }
}

module.exports = {
  startRecording,
  stopRecording,
};
