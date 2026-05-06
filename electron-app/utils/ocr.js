const Tesseract = require('tesseract.js');

async function recognizeTextFromBuffer(buffer) {
  const { data } = await Tesseract.recognize(buffer, 'rus+eng');
  return data.text.trim();
}

module.exports = { recognizeTextFromBuffer };
