const { BrowserWindow, app } = require("electron");
const path = require("path");

let settingsWindow = null;

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 565,
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload.js"),
    },
  });

  const isDev = !app.isPackaged;
  const rendererUrl = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "..", "..", "renderer", "dist", "index.html")}`;

  settingsWindow.loadURL(rendererUrl);

  settingsWindow.on("close", (event) => {
    event.preventDefault();
    settingsWindow.hide();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function toggleSettingsWindow() {
  if (!settingsWindow) {
    createSettingsWindow();
  } else {
    settingsWindow.isVisible() ? settingsWindow.hide() : settingsWindow.show();
  }
}

function getSettingsWindow() {
  return settingsWindow;
}

module.exports = {
  createSettingsWindow,
  toggleSettingsWindow,
  getSettingsWindow,
};
