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
let lineCarry = "";
let pickupContext = false;
const slots = new Map();
const live = { feGained: 0, pickupCount: 0, zone: "Waiting for zone…", initialized: false, recent: [] };

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
function broadcastLive() { for (const win of BrowserWindow.getAllWindows()) win.webContents.send("log:live", live); }
function itemName(id) { return id === 100300 ? "Flame Elementium" : `Item ${id}`; }
function addLivePickup(configId, quantity) {
  if (quantity <= 0) return;
  if (configId === 100300) live.feGained += quantity;
  live.pickupCount += quantity;
  live.recent = [{ id: Date.now() + Math.random(), configId, name: itemName(configId), quantity, time: new Date().toLocaleTimeString() }, ...live.recent].slice(0, 20);
  broadcastLive();
}
function parseLine(line) {
  const context = line.match(/ItemChange@\s*ProtoName=(\w+)\s+(start|end)/);
  if (context) { if (["PickItems", "PickItem"].includes(context[1])) pickupContext = context[2] === "start"; return; }
  const item = line.match(/BagMgr@:(?:Modfy\s+BagItem|InitBagData)\s+PageId\s*=\s*(\d+)\s+SlotId\s*=\s*(\d+)\s+ConfigBaseId\s*=\s*(\d+)\s+Num\s*=\s*(\d+)/);
  if (item) {
    const key = `${item[1]}:${item[2]}`; const configId = Number(item[3]); const quantity = Number(item[4]); const old = slots.get(key);
    slots.set(key, { configId, quantity });
    if (line.includes("InitBagData")) { live.initialized = true; broadcastLive(); return; }
    if (pickupContext && live.initialized && old && old.configId === configId && quantity > old.quantity) addLivePickup(configId, quantity - old.quantity);
    if (pickupContext && live.initialized && !old && line.includes("Modfy")) addLivePickup(configId, quantity);
    return;
  }
  const removed = line.match(/BagMgr@:RemoveBagItem\s+PageId\s*=\s*(\d+)\s+SlotId\s*=\s*(\d+)/);
  if (removed) { slots.delete(`${removed[1]}:${removed[2]}`); return; }
  const zone = line.match(/SceneLevelMgr@\s+OpenMainWorld\s+END!\s+InMainLevelPath\s*=\s*(.+)/);
  if (zone) { live.zone = zone[1].trim().split("/").filter(Boolean).slice(-2, -1)[0] || zone[1].trim(); broadcastLive(); }
}
function parseChunk(text) {
  const lines = (lineCarry + text).split(/\r?\n/); lineCarry = lines.pop() || "";
  for (const line of lines) if (line.includes("ItemChange@") || line.includes("BagMgr@:") || line.includes("SceneLevelMgr@")) parseLine(line);
}
function readNewLogBytes() {
  try {
    const fileSize = fs.statSync(logPath).size;
    if (fileSize < lastSize) { lastSize = 0; lineCarry = ""; slots.clear(); }
    if (fileSize === lastSize) return;
    const amount = Math.min(fileSize - lastSize, 2 * 1024 * 1024);
    const buffer = Buffer.allocUnsafe(amount); const fd = fs.openSync(logPath, "r");
    const bytes = fs.readSync(fd, buffer, 0, amount, lastSize); fs.closeSync(fd);
    lastSize += bytes; parseChunk(buffer.subarray(0, bytes).toString("utf8"));
  } catch { logPath = null; }
}
function connectLog(candidate) {
  if (!candidate || !validLog(candidate)) return false;
  if (watcher) clearInterval(watcher);
  logPath = candidate; lastSize = fs.statSync(logPath).size;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({ logPath }, null, 2));
  watcher = setInterval(() => { readNewLogBytes(); broadcastStatus(); }, 250);
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(here, "preload.cjs") },
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
ipcMain.handle("log:getLive", () => live);
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
