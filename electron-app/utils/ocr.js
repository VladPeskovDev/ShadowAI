const Tesseract = require('tesseract.js');

async function recognizeTextFromBuffer(buffer) {
  const { data } = await Tesseract.recognize(buffer, 'rus+eng', 
    //{
    //logger: m => console.log('[OCR]', m.status, m.progress),
  //}
);
  return data.text.trim();
}

module.exports = { recognizeTextFromBuffer };
