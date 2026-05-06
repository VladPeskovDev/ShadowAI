const { BrowserWindow, screen } = require('electron');
const log = require('./logger');

function showOverlayEffect(overlayEffectEnabled) {
  try {
    if (!overlayEffectEnabled) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const overlayWindow = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    overlayWindow.loadURL(`data:text/html,
      <style>
        html, body {
          margin: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.05);
        }
      </style>
    `);

    setTimeout(() => {
      if (!overlayWindow.isDestroyed()) overlayWindow.close();
    }, 100);
  } catch (err) {
    log.error('Error in showOverlayEffect:', err);
  }
}

module.exports = { showOverlayEffect };
