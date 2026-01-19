const OpenAI = require('openai');
const { getOpenAiApiKey } = require('../modules/telegram');

function getOpenAIClient() {
  const apiKey = getOpenAiApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API ключ не установлен. Пожалуйста, добавьте его в настройках.');
  }

  return new OpenAI({
    apiKey: apiKey,
  });
}

module.exports = { getOpenAIClient };