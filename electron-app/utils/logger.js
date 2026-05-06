const DEBUG = process.env.SHADOWAI_DEBUG === '1' || !require('electron').app.isPackaged;

module.exports = {
  log: (...args) => DEBUG && console.log(...args),
  error: (...args) => console.error(...args), // ошибки всегда показываем
  warn: (...args) => DEBUG && console.warn(...args),
};
