import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR
  || (app.isPackaged ? path.dirname(process.execPath) : path.resolve(here, ".."));
app.setPath("userData", path.join(portableRoot, "TorchTrack Data"));
const settingsFile = path.join(app.getPath("userData"), "settings.json");
let logPath = null;
let lastSize = 0;
let watcher = null;

function validLog(candidate) { try { return fs.statSync(candidate).isFile(); } catch { return false; } }
function steamLibraries() {
  const roots = new Set();
  const homes = [path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam")];
  for (const home of homes) {
    roots.add(home);
    try { for (const match of fs.readFileSync(path.join(home, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) roots.add(match[1].replace(/\\\\/g, "\\")); } catch {}
  }
  return [...roots];
}
function autoLocateLog() {
  const candidates = new Set();
  const gameLog = path.join("UE_game", "TorchLight", "Saved", "Logs", "UE_game.log");
  for (const library of steamLibraries()) candidates.add(path.join(library, "steamapps", "common", "Torchlight Infinite", gameLog));
  for (let code = 67; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    for (const base of ["SteamLibrary", "Steam", path.join("Games", "Steam"), "Games", "", "Program Files", "Program Files (x86)"]) {
      const root = path.join(drive, base);
      candidates.add(path.join(root, "steamapps", "common", "Torchlight Infinite", gameLog));
      candidates.add(path.join(root, "Torchlight Infinite", gameLog));
      candidates.add(path.join(root, "Torchlight Infinite", "Game", gameLog));
    }
  }
  return [...candidates].find(validLog) || null;
}
function status() {
  if (!logPath || !validLog(logPath)) return { connected: false, path: null, updating: false };
  const stat = fs.statSync(logPath);
  return { connected: true, path: logPath, updating: Date.now() - stat.mtimeMs < 15000, modifiedAt: stat.mtimeMs };
}
function broadcastStatus() { const current = status(); for (const win of BrowserWindow.getAllWindows()) win.webContents.send("log:status", current); }
function connectLog(candidate) {
  if (!candidate || !validLog(candidate)) return false;
  if (watcher) clearInterval(watcher);
  logPath = candidate; lastSize = fs.statSync(logPath).size;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({ logPath }, null, 2));
  watcher = setInterval(() => { try { const size = fs.statSync(logPath).size; if (size !== lastSize) { lastSize = size; broadcastStatus(); } } catch { logPath = null; } }, 1000);
  broadcastStatus(); return true;
}
function restoreOrLocate() {
  try { const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8")); if (connectLog(saved.logPath)) return; } catch {}
  connectLog(autoLocateLog());
}

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: "#0d0f0e",
    title: "TorchTrack Companion",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(here, "preload.mjs") },
  });

  win.loadFile(path.join(here, "web", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
}

ipcMain.handle("log:autoLocate", () => { const found = autoLocateLog(); if (found) connectLog(found); return status(); });
ipcMain.handle("log:getStatus", () => status());
ipcMain.handle("log:choose", async () => {
  const result = await dialog.showOpenDialog({ title: "Choose Torchlight real-time log", properties: ["openFile"], filters: [{ name: "Torchlight log", extensions: ["log"] }] });
  if (!result.canceled && result.filePaths[0]) connectLog(result.filePaths[0]);
  return status();
});
app.whenReady().then(() => { createWindow(); restoreOrLocate(); });
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
