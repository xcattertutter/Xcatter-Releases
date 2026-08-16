import { app, BrowserWindow, dialog, ipcMain, Notification, screen, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR
  || (app.isPackaged ? path.dirname(process.execPath) : path.resolve(here, ".."));
app.setPath("userData", path.join(portableRoot, "TorchTrack Data"));
const settingsFile = path.join(app.getPath("userData"), "settings.json");
const pricesFile = path.join(app.getPath("userData"), "prices.json");
const shareIdFile = path.join(app.getPath("userData"), "share-id.txt");
const cloudFile = path.join(app.getPath("userData"), "cloud.json");
const historyFile = path.join(app.getPath("userData"), "map-history.json");
const TITRACK_EXPORT_URLS = ["http://127.0.0.1:8000/api/prices/export", "http://localhost:8000/api/prices/export"];
const TITRACK_NINJA_URL = "https://titrack.ninja/";
const PRICE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const CLOUD_SYNC_INTERVAL_MS = 3 * 60 * 1000;
const NINJA_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let updateConfig = { repository: "" };
try { updateConfig = { ...updateConfig, ...JSON.parse(fs.readFileSync(path.join(here, "update-config.json"), "utf8")) }; } catch {}
const UPDATE_REPOSITORY = String(updateConfig.repository || "").trim().replace(/^\/+|\/+$/g, "");
const UPDATE_API_URL = UPDATE_REPOSITORY ? `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest` : "";
let logPath = null;
let lastSize = 0;
let watcher = null;
let lineCarry = "";
let pickupContext = false;
let pendingLevelId = null;
let pendingLevelType = null;
let pendingLevelUid = null;
const slots = new Map();
const sessionStartedAt = new Date().toISOString();
const live = { feGained: 0, pickupCount: 0, estimatedValue: 0, sessionStartedAt, sessionProfit: 0, sessionMaps: [], zone: "Waiting for zone…", currentMap: "Waiting for a map…", mapTier: null, levelId: null, mapStartedAt: null, mapDurationSeconds: 0, mapActive: false, mapValue: 0, mapFeDropped: 0, mapItems: [], mapCost: 0, mapCostItems: [], mapHistory: [], paused: false, initialized: false, recent: [], valuable: [], excludedItems: [], items: [], priceCount: 0, mapPausedMs: 0, pauseStartedAt: null };
const pickupTotals = new Map();
const mapLoot = new Map();
const mapCosts = new Map();
const hubCostBaseline = new Map();
const stackableIds = new Set();
let lootSequence = 0;
let mapActive = false;
let mapPausedMs = 0;
let pauseStartedAt = null;
const exchangeRequests = new Map();
let exchangeMessage = null;
let prices = {};
let shareId = null;
let priceSyncTimer = null;
let cloudSyncTimer = null;
let ninjaSyncTimer = null;
let updateCheckTimer = null;
const priceSync = { syncing: false, available: false, lastSuccessAt: null, lastAttemptAt: null, imported: 0, message: "Waiting for TITrack" };
const cloudStatus = { syncing: false, connected: false, lastSuccessAt: null, uploaded: 0, downloaded: 0, message: "Cloud not configured" };
const ninjaSync = { syncing: false, lastSuccessAt: null, imported: 0, removed: 0, message: "TITrack Economy not fetched" };
const updateStatus = { status: UPDATE_REPOSITORY ? "idle" : "unconfigured", currentVersion: app.getVersion(), latestVersion: null, message: UPDATE_REPOSITORY ? "Updates are checked automatically" : "GitHub updates are not configured", progress: 0, releaseUrl: null, notes: null, filePath: null };
let cloudConfig = { endpoint: "", sharingKey: "", season: "ss13-afterlight" };
const itemCatalog = new Map();
let zoneCatalog = { names: {}, ambiguous: {}, levelIds: {} };
try {
  const seed = JSON.parse(fs.readFileSync(path.join(here, "items-afterlight.json"), "utf8"));
  for (const item of seed.items || []) itemCatalog.set(Number(item.id), { name: item.name_en || null, icon: item.img || null, type: item.type_en || item.type_cn || null });
} catch {}
try { zoneCatalog = JSON.parse(fs.readFileSync(path.join(here, "zones-afterlight.json"), "utf8")); } catch {}
try { live.mapHistory = JSON.parse(fs.readFileSync(historyFile, "utf8")).filter((map) => map.schemaVersion === 2).slice(0, 10); } catch {}
try { prices = JSON.parse(fs.readFileSync(pricesFile, "utf8")); } catch {}
try { cloudConfig = { ...cloudConfig, ...JSON.parse(fs.readFileSync(cloudFile, "utf8")) }; } catch {}
sanitizePrices();
try { shareId = fs.readFileSync(shareIdFile, "utf8").trim(); } catch {}
if (!shareId) {
  shareId = crypto.randomUUID();
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(shareIdFile, shareId);
}

function validLog(candidate) { try { return fs.statSync(candidate).isFile(); } catch { return false; } }
function steamInstallPaths() {
  const found = new Set();
  const keys = ["HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "HKLM\\SOFTWARE\\Valve\\Steam", "HKCU\\SOFTWARE\\Valve\\Steam"];
  for (const key of keys) {
    try {
      for (const value of ["InstallPath", "SteamPath"]) {
        const probe = spawnSync("reg.exe", ["query", key, "/v", value], { encoding: "utf8", windowsHide: true, timeout: 5000 });
        const match = (probe.stdout || "").match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`, "i"));
        if (match?.[1]) found.add(match[1].trim().replace(/\\\\/g, "\\"));
      }
    } catch {}
  }
  return [...found];
}
function steamLibraries() {
  const roots = new Set();
  const bases = ["Steam", "SteamLibrary", "Games\\Steam", "Games\\SteamLibrary", "Games", "Program Files\\Steam", "Program Files (x86)\\Steam", "Program Files\\SteamLibrary", "Program Files (x86)\\SteamLibrary"];
  for (let code = 65; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    for (const base of bases) roots.add(path.join(drive, base));
    roots.add(drive);
  }
  for (const install of steamInstallPaths()) roots.add(install);
  const libraries = new Set(roots);
  for (const root of roots) {
    try {
      const vdf = path.join(root, "steamapps", "libraryfolders.vdf");
      if (!fs.existsSync(vdf)) continue;
      const content = fs.readFileSync(vdf, "utf8");
      for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(match[1].replace(/\\\\/g, "\\"));
      for (const match of content.matchAll(/"mountedfolders"\s+"([^"]+)"/g)) libraries.add(match[1].replace(/\\\\/g, "\\"));
    } catch {}
  }
  return [...libraries];
}
function torchlightInstallDirs(libraries) {
  const dirs = new Set();
  for (const library of libraries) {
    try {
      const steamapps = path.join(library, "steamapps");
      if (!fs.existsSync(steamapps)) continue;
      for (const entry of fs.readdirSync(steamapps)) {
        if (!/^appmanifest_\d+\.acf$/i.test(entry)) continue;
        const content = fs.readFileSync(path.join(steamapps, entry), "utf8");
        if (!/"name"\s*"[^"]*[Tt]orchlight[^"]*"/.test(content)) continue;
        const install = content.match(/"installdir"\s*"([^"]+)"/i);
        if (install?.[1]) dirs.add(install[1]);
      }
    } catch {}
  }
  return [...dirs];
}
function autoLocateLog() {
  const candidates = new Set();
  const logRel = path.join("UE_game", "TorchLight", "Saved", "Logs", "UE_game.log");
  const names = ["Torchlight Infinite", "TorchlightInfinite", "Torchlight-Infinite", "torchlight_infinite"];
  const libraries = steamLibraries();
  for (const install of torchlightInstallDirs(libraries)) {
    for (const library of libraries) candidates.add(path.join(library, "steamapps", "common", install, logRel));
  }
  for (const library of libraries) {
    for (const name of names) {
      candidates.add(path.join(library, "steamapps", "common", name, logRel));
      candidates.add(path.join(library, "steamapps", "common", name, "Game", logRel));
      candidates.add(path.join(library, name, logRel));
      candidates.add(path.join(library, name, "Game", logRel));
    }
  }
  for (const base of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
    if (!base) continue;
    for (const name of ["TorchLight", "Torchlight", "Torchlight Infinite"]) candidates.add(path.join(base, name, "Saved", "Logs", "UE_game.log"));
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
function broadcastPriceSync() { for (const win of BrowserWindow.getAllWindows()) win.webContents.send("prices:status", priceSync); }
function broadcastCloudStatus() { for (const win of BrowserWindow.getAllWindows()) win.webContents.send("cloud:status", cloudStatus); }
function publicUpdateStatus() { const { filePath: _filePath, ...safe } = updateStatus; return safe; }
function broadcastUpdateStatus() { const current = publicUpdateStatus(); for (const win of BrowserWindow.getAllWindows()) win.webContents.send("updates:status", current); }
function semverParts(value) { return String(value || "").replace(/^v/i, "").split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0).slice(0, 3); }
function isNewerVersion(candidate, current) {
  const next = semverParts(candidate); const installed = semverParts(current);
  for (let index = 0; index < 3; index++) { if ((next[index] || 0) !== (installed[index] || 0)) return (next[index] || 0) > (installed[index] || 0); }
  return false;
}
function setUpdateStatus(next) { Object.assign(updateStatus, next); broadcastUpdateStatus(); }
function updatesDir() { const dir = path.join(app.getPath("userData"), "Updates"); fs.mkdirSync(dir, { recursive: true }); return dir; }
function updatesLog(message) { try { fs.appendFileSync(path.join(updatesDir(), "updates.log"), `[${new Date().toISOString()}] ${message}\n`); } catch {} }
function writeLastError(message) { try { if (!message) return; fs.writeFileSync(path.join(updatesDir(), "last-error.txt"), String(message).slice(0, 800)); } catch {} }
function clearLastError() { try { fs.rmSync(path.join(app.getPath("userData"), "Updates", "last-error.txt"), { force: true }); } catch {} }
function readLastError() { try { return fs.readFileSync(path.join(app.getPath("userData"), "Updates", "last-error.txt"), "utf8").trim() || null; } catch { return null; } }
async function latestRelease() {
  if (!UPDATE_API_URL) throw new Error("GitHub updates are not configured");
  const response = await fetch(UPDATE_API_URL, { signal: AbortSignal.timeout(15000), headers: { accept: "application/vnd.github+json", "user-agent": `Xcatter/${app.getVersion()}`, "x-github-api-version": "2022-11-28" } });
  if (!response.ok) throw new Error(response.status === 404 ? "No public Xcatter release is available yet" : `GitHub update check failed (${response.status})`);
  return response.json();
}
function releaseAsset(release, version) {
  const expected = `Xcatter-Portable-${version}.exe`.toLowerCase();
  return (release.assets || []).find((asset) => String(asset.name || "").toLowerCase() === expected)
    || (release.assets || []).find((asset) => /^xcatter-portable-.*\.exe$/i.test(String(asset.name || "")));
}
async function expectedAssetHash(release, asset) {
  const githubDigest = String(asset.digest || "").match(/^sha256:([a-f0-9]{64})$/i)?.[1];
  if (githubDigest) { updatesLog("hash: using release asset digest"); return githubDigest.toLowerCase(); }
  try {
    const url = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/assets/${asset.id}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: "application/vnd.github+json", "user-agent": `Xcatter/${app.getVersion()}`, "x-github-api-version": "2022-11-28" } });
    if (response.ok) {
      const data = await response.json();
      const digest = String(data.digest || "").match(/^sha256:([a-f0-9]{64})$/i)?.[1];
      if (digest) { updatesLog("hash: using GitHub asset API digest"); return digest.toLowerCase(); }
    }
  } catch {}
  const checksum = (release.assets || []).find((entry) => entry.name === `${asset.name}.sha256`);
  if (!checksum?.browser_download_url) throw new Error("This release is missing its security checksum");
  updatesLog("hash: falling back to .sha256 sidecar");
  const response = await fetch(checksum.browser_download_url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": `Xcatter/${app.getVersion()}` } });
  if (!response.ok) throw new Error("The release checksum could not be downloaded");
  const hash = (await response.text()).match(/[a-f0-9]{64}/i)?.[0];
  if (!hash) throw new Error("The release checksum is invalid");
  return hash.toLowerCase();
}
async function checkForUpdates(manual = false) {
  if (!UPDATE_REPOSITORY || ["checking", "downloading", "ready"].includes(updateStatus.status)) return publicUpdateStatus();
  updatesLog(`check: starting (manual=${manual}) current=${app.getVersion()}`);
  setUpdateStatus({ status: "checking", message: "Checking GitHub for updates…", progress: 0 });
  try {
    const release = await latestRelease();
    const version = String(release.tag_name || "").replace(/^v/i, "");
    updatesLog(`check: latest release tag=${release.tag_name} version=${version}`);
    if (!isNewerVersion(version, app.getVersion())) {
      clearLastError();
      updatesLog("check: up to date");
      setUpdateStatus({ status: "up-to-date", latestVersion: version || app.getVersion(), message: manual ? "Xcatter is up to date" : "Updates are checked automatically", releaseUrl: release.html_url || null, notes: null });
      return publicUpdateStatus();
    }
    const asset = releaseAsset(release, version);
    if (!asset?.browser_download_url) throw new Error(`Xcatter v${version} does not include a portable Windows build`);
    const allowedPrefix = `https://github.com/${UPDATE_REPOSITORY}/releases/download/`.toLowerCase();
    if (!String(asset.browser_download_url).toLowerCase().startsWith(allowedPrefix)) throw new Error("GitHub returned an unexpected download address");
    updateStatus.release = release; updateStatus.asset = asset;
    updatesLog(`check: update available v${version} asset=${asset.name} size=${asset.size || "unknown"}`);
    clearLastError();
    setUpdateStatus({ status: "available", latestVersion: version, message: `Xcatter v${version} is ready`, progress: 0, releaseUrl: release.html_url || null, notes: String(release.body || "").slice(0, 1200) || null });
    if (Notification.isSupported()) {
      const notice = new Notification({ title: "Xcatter update available", body: `Version ${version} is ready. Open Xcatter to update.` });
      notice.on("click", () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
      notice.show();
    }
  } catch (error) {
    const message = error?.message || "Could not check for updates";
    updatesLog(`check: FAILED ${message}`);
    if (manual) writeLastError(`Check failed: ${message}`);
    setUpdateStatus({ status: manual ? "error" : "idle", message: manual ? message : "Updates are checked automatically" });
  }
  return publicUpdateStatus();
}
async function downloadUpdate() {
  if (updateStatus.status !== "available" || !updateStatus.asset || !updateStatus.release) return publicUpdateStatus();
  const asset = updateStatus.asset; const release = updateStatus.release;
  setUpdateStatus({ status: "downloading", message: `Downloading Xcatter v${updateStatus.latestVersion}…`, progress: 0 });
  updatesLog("download: starting");
  const updatesDirPath = updatesDir();
  const destination = path.join(updatesDirPath, path.basename(asset.name));
  const temporary = `${destination}.part`;
  let expectedHash = null;
  let response = null;
  try {
    expectedHash = await expectedAssetHash(release, asset);
    updatesLog(`download: expected hash=${expectedHash}`);
  } catch (error) {
    const message = error?.message || "Could not fetch the security checksum";
    updatesLog(`download: FAILED (checksum) ${message}`);
    writeLastError(message); setUpdateStatus({ status: "error", message, progress: 0 });
    return publicUpdateStatus();
  }
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    attempts++;
    updatesLog(`download: attempt ${attempts}/${maxAttempts}`);
    try {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(10 * 60 * 1000), headers: { "user-agent": `Xcatter/${app.getVersion()}`, Accept: "*/*" } });
      if (!response.ok) {
        let detail = response.statusText || "";
        try { detail = (await response.text()).slice(0, 160); } catch {}
        updatesLog(`download: HTTP ${response.status} ${detail}`);
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        if (attempts < maxAttempts) {
          const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : 1500;
          updatesLog(`download: retrying in ${wait}ms`);
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
        const message = `Update download failed (${response.status})${detail ? ` — ${detail}` : ""}`;
        updatesLog(`download: FAILED ${message}`);
        writeLastError(message); setUpdateStatus({ status: "error", message, progress: 0 });
        return publicUpdateStatus();
      }
      if (!response.body) throw new Error("Update download returned no data");
      const total = Number(response.headers.get("content-length") || asset.size || 0);
      const handle = fs.openSync(temporary, "w");
      const hash = crypto.createHash("sha256");
      const reader = response.body.getReader();
      let received = 0; let lastProgress = -1;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          fs.writeSync(handle, value); hash.update(value); received += value.byteLength;
          const progress = total ? Math.min(99, Math.floor((received / total) * 100)) : 0;
          if (progress !== lastProgress) { lastProgress = progress; setUpdateStatus({ progress, message: `Downloading Xcatter v${updateStatus.latestVersion}… ${progress}%` }); }
        }
      } finally { fs.closeSync(handle); }
      const actual = hash.digest("hex").toLowerCase();
      updatesLog(`download: received ${received} bytes hash=${actual}`);
      if (actual !== expectedHash) {
        const message = "Update verification failed. Nothing was installed.";
        updatesLog(`download: FAILED hash mismatch (expected ${expectedHash})`);
        writeLastError(`${message} Expected ${expectedHash}, got ${actual}.`);
        setUpdateStatus({ status: "error", message, progress: 0 });
        return publicUpdateStatus();
      }
      break;
    } catch (error) {
      updatesLog(`download: FAILED ${error?.message || error}`);
      if (attempts < maxAttempts) { try { fs.rmSync(temporary, { force: true }); } catch {} await new Promise((resolve) => setTimeout(resolve, 30000)); continue; }
      const message = error?.message || "Update download failed";
      writeLastError(message); setUpdateStatus({ status: "error", message, progress: 0 });
      return publicUpdateStatus();
    }
  }
  let staged = false;
  for (let attempt = 1; attempt <= 5 && !staged; attempt++) {
    try {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 750));
      try { fs.rmSync(destination, { force: true }); } catch {}
      fs.renameSync(temporary, destination);
      staged = true;
    } catch (error) {
      updatesLog(`download: stale attempt ${attempt}/5 ${error?.message || error}`);
    }
  }
  if (!staged) {
    try { fs.copyFileSync(temporary, destination); staged = true; } catch (error) { updatesLog(`download: copy fallback failed ${error?.message || error}`); }
  }
  if (!staged) {
    const message = "The update file could not be moved into place (it may be locked by antivirus). Nothing was installed.";
    updatesLog(`download: FAILED staging ${message}`);
    writeLastError(message); setUpdateStatus({ status: "error", message, progress: 0 });
    return publicUpdateStatus();
  }
  try { fs.rmSync(temporary, { force: true }); } catch {}
  updatesLog("download: complete, staged for install");
  clearLastError();
  setUpdateStatus({ status: "ready", progress: 100, message: `Xcatter v${updateStatus.latestVersion} is ready to install`, filePath: destination });
  return publicUpdateStatus();
}
function powershellQuote(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function deleteScheduledTask(taskName) {
  return new Promise((resolve) => {
    const worker = spawn("schtasks.exe", ["/delete", "/tn", taskName, "/f"], { windowsHide: true, stdio: "ignore" });
    worker.on("error", () => resolve());
    worker.on("exit", () => resolve());
  });
}
function runScheduledTask(scriptPath, taskName) {
  return new Promise((resolve) => {
    const worker = spawn("schtasks.exe", ["/create", "/tn", taskName, "/tr", `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, "/sc", "once", "/st", "00:00", "/f", "/it"], { windowsHide: true, stdio: "ignore" });
    worker.on("error", () => resolve(false));
    worker.on("exit", (code) => resolve(code === 0));
  });
}
function runScheduledTaskNow(taskName) {
  return new Promise((resolve) => {
    const worker = spawn("schtasks.exe", ["/run", "/tn", taskName], { windowsHide: true, stdio: "ignore" });
    worker.on("error", () => resolve(false));
    worker.on("exit", (code) => resolve(code === 0));
  });
}
async function installUpdate() {
  if (updateStatus.status !== "ready" || !updateStatus.filePath) return publicUpdateStatus();
  const target = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!app.isPackaged || !target || path.extname(target).toLowerCase() !== ".exe") { setUpdateStatus({ status: "error", message: "Automatic replacement is available in the portable Windows build" }); return publicUpdateStatus(); }
  const updatesDir = path.join(app.getPath("userData"), "Updates");
  fs.mkdirSync(updatesDir, { recursive: true });
  const staged = `${target}.update`; const previous = `${target}.previous`;
  try { fs.copyFileSync(updateStatus.filePath, staged); }
  catch (error) { setUpdateStatus({ status: "error", message: error?.message || "Could not stage the update" }); return publicUpdateStatus(); }
  const scriptPath = path.join(updatesDir, "install.ps1");
  const logPath = path.join(updatesDir, "install.log");
  const stateFile = path.join(updatesDir, "swap.state");
  const taskName = "XcatterAutoUpdate";
  try { fs.rmSync(logPath, { force: true }); } catch {}
  try { fs.writeFileSync(stateFile, "pending"); } catch {}
  const script = `$ErrorActionPreference = 'Stop'
$LogFile = ${powershellQuote(logPath)}
$TaskName = ${powershellQuote(taskName)}
function Log($msg) { try { Add-Content -LiteralPath $LogFile -Value ("[" + (Get-Date -Format s) + "] " + $msg) -ErrorAction SilentlyContinue } catch {} }
function Remove-Task { try { & schtasks.exe /delete /tn $TaskName /f *> $null } catch {} }
function Invoke-Retry([scriptblock]$Action, [int]$Attempts = 8) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try { & $Action; return } catch { if ($i -ge $Attempts) { throw }; Start-Sleep -Milliseconds 500 }
  }
}
$innerPid = ${process.pid}
$launcherPid = ${process.ppid}
$target = ${powershellQuote(target)}
$previous = ${powershellQuote(previous)}
$staged = ${powershellQuote(staged)}
$stateFile = ${powershellQuote(stateFile)}
function MarkSwapState($value) { try { Set-Content -LiteralPath $stateFile -Value $value -ErrorAction SilentlyContinue } catch {} }
Log "install starting; inner=$innerPid launcher=$launcherPid target=$target"
$deadline = (Get-Date).AddSeconds(90)
$appGone = $false
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $innerPid -ErrorAction SilentlyContinue)) { $appGone = $true; break }
  Start-Sleep -Milliseconds 300
}
if (-not $appGone) { Log "app did not exit in time; aborting update"; MarkSwapState "stopped"; Remove-Task; exit 1 }
if ($launcherPid -and $launcherPid -ne $innerPid) {
  $launcherDeadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $launcherDeadline) {
    $lp = Get-Process -Id $launcherPid -ErrorAction SilentlyContinue
    if (-not $lp) { break }
    try { if ($lp.Path -and ($lp.Path -ne $target)) { break } } catch {}
    Start-Sleep -Milliseconds 300
  }
}
Start-Sleep -Milliseconds 500
Log "app exited; swapping executables"
MarkSwapState "swapping"
try {
  Invoke-Retry { Remove-Item -LiteralPath $previous -Force -ErrorAction SilentlyContinue }
  Invoke-Retry { Move-Item -LiteralPath $target -Destination $previous -Force }
  Invoke-Retry { Move-Item -LiteralPath $staged -Destination $target -Force }
} catch {
  Log ("swap failed: " + $_.Exception.Message)
  try { Invoke-Retry { Move-Item -LiteralPath $previous -Destination $target -Force } } catch { Log ("restore failed: " + $_.Exception.Message) }
  MarkSwapState "failed"
  Remove-Task
  exit 1
}
Log "swap complete; starting new build"
$started = $false
for ($i = 1; $i -le 5 -and -not $started; $i++) {
  try { Start-Process -FilePath $target; $started = $true } catch { Start-Sleep -Milliseconds 500 }
}
if ($started) { Log "install complete"; MarkSwapState "done" } else { Log "failed to start new build"; MarkSwapState "failed" }
Remove-Task
`;
  fs.writeFileSync(scriptPath, "\uFEFF" + script);
  await deleteScheduledTask(taskName);
  const scheduled = await runScheduledTask(scriptPath, taskName);
  if (!scheduled) { setUpdateStatus({ status: "error", message: "The update could not be scheduled on this system" }); return publicUpdateStatus(); }
  const started = await runScheduledTaskNow(taskName);
  if (!started) { setUpdateStatus({ status: "error", message: "The update task could not be started" }); return publicUpdateStatus(); }
  setUpdateStatus({ status: "installing", message: "Restarting into the new version…", progress: 100 });
  setTimeout(() => app.quit(), 500);
  return publicUpdateStatus();
}
function itemName(id) { return id === 100300 ? "Flame Elementium" : prices[id]?.name || itemCatalog.get(id)?.name || `Unknown item ${id}`; }
function itemIcon(id) { return itemCatalog.get(id)?.icon || null; }
function unitPrice(id) { return id === 100300 ? 1 : Math.max(0, Math.min(5000000, Number(prices[id]?.value || 0))); }
function isHiddenUnknown(id) {
  if (unitPrice(id) > 0) return false;
  const name = itemName(id);
  if (name !== `Unknown item ${id}`) return false;
  const type = itemCatalog.get(id)?.type || "";
  if (/技能|装备|organ|armor|weapon|gear|relic|idol|tome|skill/i.test(type)) return true;
  return (id >= 5000 && id < 8000) || (id >= 100000 && id < 150000) || (id >= 300000 && id < 10000000);
}
const EXCLUDED_TYPES = new Set([
  "传奇装备","核心器官","核心器官-头部","核心器官-胸甲","核心器官-项链","核心器官-手套","核心器官-腰带","核心器官-鞋子","核心器官-戒指","普通器官","特殊器官-其它","特殊器官-前缀","神骸","装备蓝图",
  "完美皮肤-防御","完美心脏-增益","完美喉舌-祝福","完美眼球-减益","完美胚胎-召唤","完美肝脏-转伤","完美羽翼-持续",
  "主动技能","辅助技能","崇高辅助技能","华贵辅助技能","被动技能","触媒技能",
  "英雄追忆",
  "异度棱镜","特殊棱镜","逆像的残影",
  "巨力之神","狩猎之神","知识之神","征战之神","欺诈之神","机械之神",
  "冥王的神格",
]);
function isGearLikeId(id) {
  return (id >= 1000 && id < 5000) || (id >= 7000 && id < 9000) || (id >= 71000 && id < 72000) || (id >= 110000 && id < 115000) || (id >= 380000 && id < 390000);
}
function isExcludedType(id) {
  if (!itemCatalog.has(id) && isGearLikeId(id)) return true;
  const type = itemCatalog.get(id)?.type || "";
  return EXCLUDED_TYPES.has(type) || /skill|equip|armor|weapon|gear|organ|relic|tome|idol/i.test(type);
}
function tracked(id) { return !isHiddenUnknown(id) && !isExcludedType(id); }
function isMapCostItem(id) {
  const item = itemCatalog.get(id); const text = `${itemName(id)} ${item?.type || ""}`;
  return /compass|netherrealm resonance|beacon|probe|astrolabe/i.test(text);
}
function currentCostTotals() {
  const totals = new Map();
  for (const item of slots.values()) if (isMapCostItem(item.configId)) totals.set(item.configId, (totals.get(item.configId) || 0) + item.quantity);
  return totals;
}
function currentInventoryTotals() {
  const totals = new Map();
  for (const [key, item] of slots) {
    if (Number(key.split(":", 1)[0]) === 100) continue;
    totals.set(item.configId, (totals.get(item.configId) || 0) + item.quantity);
  }
  return totals;
}
function captureHubCostBaseline() {
  hubCostBaseline.clear();
  for (const [configId, quantity] of currentCostTotals()) hubCostBaseline.set(configId, quantity);
}
function beginMapCosts() {
  mapCosts.clear(); const current = currentCostTotals();
  for (const [configId, before] of hubCostBaseline) {
    const quantity = Math.max(0, before - (current.get(configId) || 0));
    if (quantity > 0) mapCosts.set(configId, { configId, quantity });
  }
  captureHubCostBaseline();
}
function mapDurationMs(endedAt = Date.now()) {
  if (!live.mapStartedAt) return 0;
  const pausedNow = pauseStartedAt ? endedAt - pauseStartedAt : 0;
  return Math.max(0, endedAt - Date.parse(live.mapStartedAt) - mapPausedMs - pausedNow);
}
function completeCurrentMap() {
  if (!mapActive || !live.mapStartedAt || live.currentMap.startsWith("Waiting")) return;
  refreshValuation();
  const completed = { schemaVersion: 2, id: crypto.randomUUID(), name: live.currentMap, tier: live.mapTier, levelId: live.levelId, startedAt: live.mapStartedAt, completedAt: new Date().toISOString(), durationSeconds: Math.round(mapDurationMs() / 1000), feDropped: live.mapFeDropped, totalValue: live.mapValue, cost: live.mapCost, profit: live.mapValue - live.mapCost, items: live.mapItems.map((item) => ({ ...item })), costItems: live.mapCostItems.map((item) => ({ ...item })) };
  live.mapDurationSeconds = completed.durationSeconds;
  live.mapHistory = [completed, ...live.mapHistory].slice(0, 10);
  live.sessionMaps = [completed, ...live.sessionMaps];
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(live.mapHistory, null, 2));
  mapActive = false;
  live.mapActive = false;
  refreshValuation();
}
function setPaused(paused) {
  if (paused === live.paused) return live;
  if (paused) pauseStartedAt = Date.now();
  else if (pauseStartedAt) { mapPausedMs += Date.now() - pauseStartedAt; pauseStartedAt = null; }
  live.paused = paused; live.mapPausedMs = mapPausedMs; live.pauseStartedAt = pauseStartedAt; broadcastLive(); return live;
}
function resetSession() {
  live.feGained = 0;
  live.pickupCount = 0;
  live.sessionProfit = 0;
  live.sessionMaps = [];
  live.sessionStartedAt = new Date().toISOString();
  pickupTotals.clear();
  mapLoot.clear();
  mapCosts.clear();
  hubCostBaseline.clear();
  live.mapItems = [];
  live.excludedItems = [];
  live.mapValue = 0;
  live.mapFeDropped = 0;
  live.mapCost = 0;
  live.mapCostItems = [];
  live.mapDurationSeconds = 0;
  live.mapStartedAt = null;
  live.mapTier = null;
  live.levelId = null;
  live.levelType = null;
  mapActive = false;
  live.mapActive = false;
  mapPausedMs = 0;
  pauseStartedAt = null;
  lootSequence = 0;
  live.mapPausedMs = 0;
  live.pauseStartedAt = null;
  refreshValuation();
  broadcastLive();
  return live;
}
function zoneDetails(raw, levelId = null) {
  if (levelId !== null && zoneCatalog.levelIds?.[String(levelId)]) return { name: zoneCatalog.levelIds[String(levelId)], hub: false, known: true };
  const names = zoneCatalog.names || {};
  if (levelId !== null) {
    for (const [pattern, choices] of Object.entries(zoneCatalog.ambiguous || {})) {
      const choice = choices[String(levelId % 100)];
      if (raw.includes(pattern) && choice) return { name: choice, hub: false, known: true };
    }
  }
  for (const [pattern, name] of Object.entries(names).sort((a, b) => b[0].length - a[0].length)) {
    if (raw.includes(pattern)) return { name, hub: /^Hideout\s+-/i.test(name), known: true };
  }
  const segment = raw.split("/").filter(Boolean).slice(-2, -1)[0] || raw;
  return { name: segment.replace(/^XZ_/, "").replace(/\d+$/, "").replace(/_/g, " "), hub: false, known: false };
}
function timemarkLabel(levelId, levelType = null, raw = "") {
  if (levelType === 11) return "Nightmare";
  if (!Number.isFinite(levelId)) return /DeepSpace|Deep_Space/i.test(raw) ? "Deep Space" : null;
  const prefix = Math.floor(levelId / 100);
  if (prefix === 53) return "Profound";
  if (prefix === 54 || /DeepSpace|Deep_Space/i.test(raw)) return "Deep Space";
  if (prefix >= 50 && prefix <= 52) return `Timemark 8-${prefix - 50}`;
  if (prefix >= 46 && prefix <= 49) return `Timemark 7-${prefix - 46}`;
  return null;
}
function refreshValuation() {
  const inventoryTotals = new Map();
  for (const [key, item] of slots) {
    const pageId = Number(key.split(":", 1)[0]);
    if (pageId === 100) continue;
    inventoryTotals.set(item.configId, (inventoryTotals.get(item.configId) || 0) + item.quantity);
  }
  live.items = [...inventoryTotals.entries()].map(([configId, quantity]) => ({ configId, name: itemName(configId), icon: itemIcon(configId), quantity, unitPrice: unitPrice(configId), totalValue: quantity * unitPrice(configId), priceSource: configId === 100300 ? "currency" : prices[configId]?.source || null, pricedAt: prices[configId]?.updatedAt || null })).filter((item) => tracked(item.configId)).sort((a, b) => b.totalValue - a.totalValue);
  live.estimatedValue = live.items.reduce((sum, item) => sum + item.totalValue, 0);
  live.priceCount = Object.keys(prices).length;
  live.recent = (live.recent || []).filter((item) => tracked(item.configId));
  for (const item of live.recent) { item.unitPrice = unitPrice(item.configId); item.totalValue = item.quantity * unitPrice(item.configId); }
  live.mapItems = [...mapLoot.values()].map((item) => ({ ...item, name: itemName(item.configId), icon: itemIcon(item.configId), unitPrice: unitPrice(item.configId), totalValue: item.quantity * unitPrice(item.configId), pricedAt: prices[item.configId]?.updatedAt || null })).filter((item) => tracked(item.configId)).sort((a, b) => b.totalValue - a.totalValue || b.quantity - a.quantity);
  live.mapValue = live.mapItems.reduce((sum, item) => sum + item.totalValue, 0);
  live.mapFeDropped = live.mapItems.filter((item) => item.configId === 100300).reduce((sum, item) => sum + item.quantity, 0);
  live.mapCostItems = [...mapCosts.values()].map((item) => ({ ...item, name: itemName(item.configId), icon: itemIcon(item.configId), unitPrice: unitPrice(item.configId), totalValue: item.quantity * unitPrice(item.configId), pricedAt: prices[item.configId]?.updatedAt || null })).sort((a, b) => b.totalValue - a.totalValue);
  live.mapCost = live.mapCostItems.reduce((sum, item) => sum + item.totalValue, 0);
  live.valuable = [...pickupTotals.entries()].map(([configId, quantity]) => ({ configId, name: itemName(configId), icon: itemIcon(configId), quantity, unitPrice: unitPrice(configId), totalValue: quantity * unitPrice(configId) })).filter((item) => tracked(item.configId) && item.totalValue >= 1).sort((a, b) => b.totalValue - a.totalValue);
  live.excludedItems = [...mapLoot.values()].map((item) => ({ ...item, name: itemName(item.configId), icon: itemIcon(item.configId), unitPrice: unitPrice(item.configId), totalValue: item.quantity * unitPrice(item.configId) })).filter((item) => isExcludedType(item.configId)).sort((a, b) => b.totalValue - a.totalValue || b.quantity - a.quantity);
  const completedProfit = live.sessionMaps.reduce((sum, map) => sum + Number(map.profit ?? map.totalValue ?? 0), 0);
  live.sessionProfit = completedProfit + (mapActive ? live.mapValue - live.mapCost : 0);
}
function savePrices() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(pricesFile, JSON.stringify(prices, null, 2));
}
function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function weightedMedian(entries) {
  const valid = entries.filter((entry) => Number.isFinite(Number(entry.value)) && Number(entry.value) >= 0 && Number.isFinite(Number(entry.weight)) && Number(entry.weight) > 0);
  if (!valid.length) return 0;
  const sorted = valid.map((entry) => ({ value: Number(entry.value), weight: Number(entry.weight) })).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  let acc = 0;
  for (const entry of sorted) {
    acc += entry.weight;
    if (acc >= total / 2) return entry.value;
  }
  return sorted[sorted.length - 1].value;
}
function totalContributors(samples) {
  const usable = Object.values(samples || {}).filter((sample) => Number.isFinite(Number(sample.value)));
  return usable.reduce((sum, sample) => sum + Number(sample.weight || 1), 0);
}
function sanePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 5000000;
}
function sanitizePrices() {
  let changed = false;
  for (const [configId, price] of Object.entries(prices)) {
    if (!price || typeof price !== "object") { delete prices[configId]; changed = true; continue; }
    if (price.samples && typeof price.samples === "object") {
      const cleaned = {};
      for (const [sampleId, sample] of Object.entries(price.samples)) {
        const value = Number(sample?.value);
        const weight = Number(sample?.weight ?? 1);
        if (sanePrice(value) && Number.isFinite(weight) && weight > 0) cleaned[sampleId] = sample;
      }
      const usable = Object.values(cleaned);
      if (!usable.length) { delete prices[configId]; changed = true; continue; }
      if (usable.length !== Object.keys(price.samples).length) changed = true;
      prices[configId] = { ...price, samples: cleaned, value: weightedMedian(usable), updatedAt: usable.map((sample) => sample.updatedAt).sort().at(-1) || price.updatedAt || null };
      continue;
    }
    const value = Number(price.value);
    if (sanePrice(value)) { if (Number(price.value) !== value) { prices[configId] = { ...price, value }; changed = true; } continue; }
    delete prices[configId]; changed = true;
  }
  if (changed) savePrices();
}
function mergePriceSample(configId, sampleId, value, updatedAt, details = {}, weight = 1) {
  if (!sanePrice(value)) return;
  const current = prices[configId] || {};
  const samples = { ...(current.samples || {}) };
  const timestamp = updatedAt || new Date().toISOString();
  if (!samples[sampleId] || Date.parse(timestamp) >= Date.parse(samples[sampleId].updatedAt || 0)) samples[sampleId] = { value: Number(value), updatedAt: timestamp, weight };
  const usable = Object.values(samples).filter((sample) => Number.isFinite(Number(sample.value)) && sanePrice(sample.value));
  if (!usable.length) return;
  const contributors = totalContributors(samples);
  prices[configId] = {
    ...current, ...details, samples,
    value: weightedMedian(usable),
    updatedAt: usable.map((sample) => sample.updatedAt).sort().at(-1) || timestamp,
    source: usable.length > 1 ? `${contributors} shared contributor${contributors === 1 ? "" : "s"}` : details.source || current.source || "Local price",
  };
}
function recomputePrice(configId) {
  const current = prices[configId];
  if (!current) return;
  const usable = Object.values(current.samples || {}).filter((sample) => Number.isFinite(Number(sample.value)) && sanePrice(sample.value));
  if (!usable.length) { delete prices[configId]; return; }
  const contributors = totalContributors(current.samples);
  prices[configId] = {
    ...current,
    value: weightedMedian(usable),
    updatedAt: usable.map((sample) => sample.updatedAt).sort().at(-1) || current.updatedAt,
    source: usable.length > 1 ? `${contributors} shared contributor${contributors === 1 ? "" : "s"}` : current.source || "Local price",
  };
}
function exportPricePayload() {
  return {
    meta: { schema: "torchtrack-prices-v1", season: "SS13 Afterlight", exported_at_utc: new Date().toISOString(), contributor_id: shareId, privacy: "No account, character, or gameplay-log data included" },
    prices: Object.entries(prices).map(([id, price]) => ({ id, name_en: price.name || null, price_fe: Number(price.value || 0), source: price.source || "TorchTrack", updated_at: price.updatedAt || null, samples: price.samples || {} })),
  };
}
function importPricePayload(data, fallbackContributor) {
  const entries = Array.isArray(data?.prices) ? data.prices : data?.prices && typeof data.prices === "object" ? Object.entries(data.prices).map(([id, value]) => ({ id, ...value })) : data && typeof data === "object" ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
  const contributor = data?.meta?.contributor_id || fallbackContributor;
  const exportedAt = data?.meta?.exported_at_utc || new Date().toISOString();
  let imported = 0;
  for (const entry of entries) {
    const configId = Number(entry.id ?? entry.config_base_id); const value = Number(entry.price_fe ?? entry.price ?? entry.value);
    if (!Number.isInteger(configId) || configId <= 0 || !Number.isFinite(value) || value < 0) continue;
    const details = { name: entry.name_en || entry.name || prices[configId]?.name || null, source: "Friend price file" };
    if (entry.samples && typeof entry.samples === "object") {
      for (const [sampleId, sample] of Object.entries(entry.samples)) mergePriceSample(configId, sampleId, Number(sample.value), sample.updatedAt, details, Number(sample.weight) || 1);
    } else mergePriceSample(configId, contributor, value, entry.updated_at || (entry.last_time ? new Date(Number(entry.last_time) * 1000).toISOString() : exportedAt), details);
    imported++;
  }
  savePrices(); refreshValuation(); broadcastLive(); return imported;
}
async function syncCommunityPrices() {
  if (cloudStatus.syncing) return cloudStatus;
  const endpoint = String(cloudConfig.endpoint || "").replace(/\/$/, "");
  if (!/^https:\/\//i.test(endpoint) || !cloudConfig.sharingKey) {
    cloudStatus.connected = Boolean(ninjaSync.lastSuccessAt);
    if (!ninjaSync.lastSuccessAt) cloudStatus.message = "Cloud not configured";
    broadcastCloudStatus(); return cloudStatus;
  }
  cloudStatus.syncing = true; cloudStatus.message = "Syncing community prices…"; broadcastCloudStatus();
  try {
    const samples = Object.entries(prices)
      .flatMap(([itemId, price]) => {
        const own = price.samples?.[shareId];
        return own && Number(own.value) > 0 ? [{ item_id: Number(itemId), name: price.name || itemCatalog.get(Number(itemId))?.name || null, price_fe: Number(own.value), observed_at: own.updatedAt }] : [];
      })
      .sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1))
      .slice(0, 2000);
    const uploadResponse = await fetch(`${endpoint}/v1/samples`, { method: "POST", signal: AbortSignal.timeout(10000), headers: { "content-type": "application/json", "x-torchtrack-key": cloudConfig.sharingKey }, body: JSON.stringify({ season: cloudConfig.season, contributor_id: shareId, samples }) });
    if (!uploadResponse.ok) throw new Error(`Upload failed (${uploadResponse.status})`);
    const uploadResult = await uploadResponse.json();
    const downloadResponse = await fetch(`${endpoint}/v1/prices?season=${encodeURIComponent(cloudConfig.season)}`, { signal: AbortSignal.timeout(10000) });
    if (!downloadResponse.ok) throw new Error(`Download failed (${downloadResponse.status})`);
    const data = await downloadResponse.json();
    const reported = new Set();
    let downloaded = 0;
    for (const entry of data.prices || []) {
      const id = Number(entry.id); const value = Number(entry.price_fe);
      if (!Number.isInteger(id) || !Number.isFinite(value) || value <= 0) continue;
      reported.add(id);
      mergePriceSample(id, "cloud-community", value, entry.updated_at || data.meta?.generated_at, { name: entry.name_en || prices[id]?.name || null, source: `${entry.contributors || 1} cloud contributors` }, entry.contributors || 1);
      downloaded++;
    }
    const removed = removeUnreportedSamples("cloud-community", reported);
    savePrices(); refreshValuation(); broadcastLive();
    cloudStatus.connected = true; cloudStatus.lastSuccessAt = new Date().toISOString(); cloudStatus.uploaded = Number(uploadResult.accepted || 0); cloudStatus.downloaded = downloaded; cloudStatus.message = removed ? `${downloaded} community prices updated (${removed} removed)` : `${downloaded} community prices updated`;
  } catch (error) { cloudStatus.connected = Boolean(ninjaSync.lastSuccessAt); cloudStatus.message = String(error?.message || "Cloud unavailable"); }
  cloudStatus.syncing = false; broadcastCloudStatus(); return cloudStatus;
}
const TITRACK_NINJA_ITEM_PATTERN = /"config_base_id":(\d+),"name":"((?:[^"\\]|\\.)*?)","category":"(?:[^"\\]|\\.)*?","icon_url":"(?:[^"\\]|\\.)*?","price_fe_median":([0-9.eE+-]+),"change_24h":[0-9.eE+-]+,"change_7d":[0-9.eE+-]+,"unique_devices":(\d+)/g;
function removeUnreportedSamples(sampleId, reported) {
  const STALE_MS = 30 * 86400000;
  const cutoff = Date.now() - STALE_MS;
  let removed = 0;
  for (const [id, price] of Object.entries(prices)) {
    const sample = price.samples?.[sampleId];
    if (!sample || reported.has(Number(id))) continue;
    if (Date.parse(sample.updatedAt || 0) >= cutoff) continue;
    delete price.samples[sampleId];
    recomputePrice(Number(id));
    removed++;
  }
  return removed;
}
async function syncTITrackNinja() {
  if (ninjaSync.syncing) return ninjaSync;
  ninjaSync.syncing = true; ninjaSync.message = "Fetching TITrack Economy prices…"; broadcastCloudStatus();
  try {
    const response = await fetch(TITRACK_NINJA_URL, { signal: AbortSignal.timeout(20000), headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const chunks = [...html.matchAll(/self\.__next_f\.push\(\[(\d+),\s*"((?:[^"\\]|\\.)*)"\]\);?/g)];
    if (!chunks.length) throw new Error("Page structure changed");
    const flight = chunks.map((chunk) => JSON.parse(`"${chunk[2]}"`)).join("");
    TITRACK_NINJA_ITEM_PATTERN.lastIndex = 0;
    const reported = new Set();
    let imported = 0;
    let match;
    while ((match = TITRACK_NINJA_ITEM_PATTERN.exec(flight)) !== null) {
      const id = Number(match[1]); const value = Number(match[3]); const contributors = Number(match[4]);
      if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(value) || value <= 0 || contributors < 1) continue;
      reported.add(id);
      mergePriceSample(id, "titrack-ninja", value, new Date().toISOString(), { name: match[2], source: `${contributors} TITrack contributors` }, contributors);
      imported++;
    }
    if (!imported) throw new Error("No prices found in page");
    const removed = removeUnreportedSamples("titrack-ninja", reported);
    savePrices(); refreshValuation(); broadcastLive();
    ninjaSync.lastSuccessAt = new Date().toISOString(); ninjaSync.imported = imported; ninjaSync.removed = removed;
    ninjaSync.message = removed ? `${imported} prices from TITrack Economy (${removed} removed)` : `${imported} prices from TITrack Economy`;
    cloudStatus.connected = true; cloudStatus.message = ninjaSync.message;
  } catch (error) { ninjaSync.message = `TITrack Economy: ${String(error?.message || "unavailable")}`; }
  ninjaSync.syncing = false; broadcastCloudStatus(); return ninjaSync;
}
async function syncTITrackPrices() {
  if (priceSync.syncing) return priceSync;
  priceSync.syncing = true; priceSync.lastAttemptAt = new Date().toISOString(); priceSync.message = "Checking TITrack…"; broadcastPriceSync();
  let failure = null;
  for (const url of TITRACK_EXPORT_URLS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.prices)) throw new Error("Unexpected export format");
      const exportedAt = data.meta?.exported_at_utc || new Date().toISOString();
      let imported = 0;
      for (const entry of data.prices) {
        const configId = Number(entry.id); const value = Number(entry.price_fe);
        if (!Number.isInteger(configId) || configId <= 0 || !sanePrice(value)) continue;
        prices[configId] = { value, name: entry.name_en || prices[configId]?.name || null, source: `TITrack: ${entry.source || "local export"}`, updatedAt: exportedAt };
        imported++;
      }
      savePrices(); refreshValuation(); broadcastLive();
      priceSync.available = true; priceSync.lastSuccessAt = new Date().toISOString(); priceSync.imported = imported; priceSync.message = `${imported} prices imported`;
      priceSync.syncing = false; broadcastPriceSync(); return priceSync;
    } catch (error) { failure = error; }
  }
  priceSync.available = false; priceSync.syncing = false; priceSync.message = "TITrack is not running on this PC";
  if (failure) console.info("TITrack price sync unavailable:", failure.message);
  broadcastPriceSync(); return priceSync;
}
function addLivePickup(configId, quantity, stackable = false) {
  if (quantity <= 0 || live.paused) return;
  if (stackable) stackableIds.add(configId);
  if (configId === 100300) live.feGained += quantity;
  live.pickupCount += quantity;
  pickupTotals.set(configId, (pickupTotals.get(configId) || 0) + quantity);
  if (stackableIds.has(configId)) {
    let combined = quantity;
    for (const [key, item] of mapLoot) if (item.configId === configId) { combined += item.quantity; mapLoot.delete(key); }
    mapLoot.set(`stack:${configId}`, { id: `stack:${configId}`, configId, quantity: combined, stackable: true });
  } else {
    const key = `drop:${configId}:${++lootSequence}`;
    mapLoot.set(key, { id: key, configId, quantity, stackable: false });
  }
  live.recent = [{ id: Date.now() + Math.random(), configId, name: itemName(configId), icon: itemIcon(configId), quantity, unitPrice: unitPrice(configId), totalValue: quantity * unitPrice(configId), time: new Date().toLocaleTimeString() }, ...live.recent].slice(0, 20);
  refreshValuation();
  broadcastLive();
}
function parsePriceSections(lines) {
  let pricesFe = [], section = [], isFe = null;
  const flush = () => { if (section.length && isFe) pricesFe.push(...section); section = []; isFe = null; };
  for (const line of lines) {
    if (/\+prices\+\d+\+unitPrices/.test(line)) flush();
    const currency = line.match(/\+currency \[(\d+)\]/);
    if (currency) { if (section.length) { if (Number(currency[1]) === 100300) pricesFe.push(...section); section = []; isFe = null; } else isFe = Number(currency[1]) === 100300; continue; }
    const value = line.match(/\+(?:unitPrices\+)?\d+ \[([0-9.]+)\]/);
    if (value) { if (isFe === true) pricesFe.push(Number(value[1])); else section.push(Number(value[1])); }
  }
  flush(); return pricesFe.filter((value) => Number.isFinite(value) && value > 0).sort((a,b) => a-b);
}
function finishExchangeMessage() {
  if (!exchangeMessage) return;
  const { type, syn, lines } = exchangeMessage;
  if (type === "send") {
    const match = lines.join("\n").match(/\+refer \[(\d+)\]/);
    if (match) exchangeRequests.set(syn, Number(match[1]));
  } else {
    const configId = exchangeRequests.get(syn); const listings = parsePriceSections(lines);
    if (configId && listings.length) {
      const index = Math.max(0, Math.floor(listings.length * .10) - 1);
      mergePriceSample(configId, shareId, listings[index], new Date().toISOString(), { source: "Your Trade House search", listings: listings.length });
      savePrices();
      refreshValuation(); broadcastLive(); exchangeRequests.delete(syn);
    }
  }
  exchangeMessage = null;
}
function parseExchangeLine(line) {
  const start = line.match(/----Socket (Send|Recv)Message STT----XchgSearchPrice----SynId = (\d+)/);
  if (start) { exchangeMessage = { type: start[1] === "Send" ? "send" : "recv", syn: Number(start[2]), lines: [] }; return true; }
  if (exchangeMessage && /----Socket (?:Send|Recv)Message End----/.test(line)) { finishExchangeMessage(); return true; }
  if (exchangeMessage) { exchangeMessage.lines.push(line); return true; }
  return false;
}
function updateSlotFromLog(pageId, slotId, configId, quantity, countPickup) {
  const key = `${pageId}:${slotId}`;
  const old = slots.get(key);
  const sameItem = Boolean(old && old.configId === configId);
  const baseline = sameItem ? old.quantity : 0;
  const gained = quantity - baseline;
  slots.set(key, { configId, quantity });
  if (old && !sameItem && isMapCostItem(old.configId)) {
    const remaining = currentCostTotals().get(old.configId) || 0;
    if (remaining > 0) hubCostBaseline.set(old.configId, remaining);
    else hubCostBaseline.delete(old.configId);
  }
  if (countPickup && gained > 0) addLivePickup(configId, gained, true);
  return gained;
}
function parseLine(line) {
  if (parseExchangeLine(line)) return;
  const level = line.match(/LevelMgr@\s+LevelUid,\s*LevelType,\s*LevelId\s*=\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (level) {
    pendingLevelUid = Number(level[1]);
    pendingLevelType = Number(level[2]);
    pendingLevelId = Number(level[3]);
    return;
  }
  const context = line.match(/ItemChange@\s*ProtoName=(\w+)\s+(start|end)/);
  if (context) { if (["PickItems", "PickItem", "Push2"].includes(context[1])) pickupContext = context[2] === "start"; return; }
  const update = line.match(/ItemChange@\s+Update\s+Id=(\d+)_\S+\s+BagNum=(\d+)\s+in\s+PageId=(\d+)\s+SlotId=(\d+)/);
  if (update) {
    updateSlotFromLog(Number(update[3]), Number(update[4]), Number(update[1]), Number(update[2]), pickupContext && live.initialized);
    if (!live.initialized) live.initialized = true;
    return;
  }
  const added = line.match(/ItemChange@\s+Add\s+Id=(\d+)_\S+\s+BagNum=(\d+)\s+in\s+PageId=(\d+)\s+SlotId=(\d+)/);
  if (added) {
    updateSlotFromLog(Number(added[3]), Number(added[4]), Number(added[1]), Number(added[2]), pickupContext && live.initialized);
    return;
  }
  const item = line.match(/BagMgr@:(?:Modfy\s+BagItem|InitBagData)\s+PageId\s*=\s*(\d+)\s+SlotId\s*=\s*(\d+)\s+ConfigBaseId\s*=\s*(\d+)\s+Num\s*=\s*(\d+)/);
  if (item) {
    const configId = Number(item[3]);
    const gained = updateSlotFromLog(Number(item[1]), Number(item[2]), configId, Number(item[4]), pickupContext && live.initialized && !line.includes("InitBagData"));
    if (line.includes("InitBagData")) { live.initialized = true; broadcastLive(); return; }
    if (!live.initialized) { live.initialized = true; refreshValuation(); broadcastLive(); return; }
    if (/^Hideout\s+-/i.test(live.zone) && gained > 0 && isMapCostItem(configId)) hubCostBaseline.set(configId, currentCostTotals().get(configId) || 0);
    refreshValuation(); broadcastLive();
    return;
  }
  const removed = line.match(/BagMgr@:RemoveBagItem\s+PageId\s*=\s*(\d+)\s+SlotId\s*=\s*(\d+)/);
  if (removed) { const key = `${removed[1]}:${removed[2]}`; const old = slots.get(key); if (old && isMapCostItem(old.configId) && /^Hideout\s+-/i.test(live.zone)) return; slots.delete(key); refreshValuation(); broadcastLive(); return; }
  const zone = line.match(/SceneLevelMgr@\s+OpenMainWorld\s+END!\s+InMainLevelPath\s*=\s*(.+)/);
  if (zone) {
    const raw = zone[1].trim();
    const levelId = pendingLevelId;
    const levelType = pendingLevelType;
    const details = zoneDetails(raw, levelId);
    const tier = timemarkLabel(levelId, levelType, raw);
    pendingLevelId = null; pendingLevelType = null; pendingLevelUid = null;
    live.zone = details.name;
    if (details.hub) { completeCurrentMap(); live.mapTier = null; live.levelId = null; live.levelType = null; captureHubCostBaseline(); }
    else if (levelType === 22 && mapActive && live.levelType === 21) {
      live.zone = details.name;
    }
    else if (details.name !== live.currentMap || !mapActive) {
      completeCurrentMap();
      live.currentMap = details.known ? details.name : (tier ? `${tier} Map` : "Netherrealm Map"); live.mapTier = tier; live.levelId = levelId; live.levelType = levelType; live.mapStartedAt = new Date().toISOString();
      beginMapCosts(); mapLoot.clear(); live.mapItems = []; live.excludedItems = []; live.mapValue = 0; live.mapFeDropped = 0; live.mapCost = 0; live.mapCostItems = []; live.mapDurationSeconds = 0; lootSequence = 0; mapPausedMs = 0; pauseStartedAt = live.paused ? Date.now() : null; mapActive = true; live.mapActive = true; live.mapPausedMs = 0; live.pauseStartedAt = pauseStartedAt; refreshValuation();
    }
    broadcastLive();
  }
}
function parseChunk(text) {
  const lines = (lineCarry + text).split(/\r?\n/); lineCarry = lines.pop() || "";
  for (const line of lines) if (exchangeMessage || line.includes("XchgSearchPrice") || line.includes("ItemChange@") || line.includes("BagMgr@:") || line.includes("LevelMgr@") || line.includes("SceneLevelMgr@")) parseLine(line);
}
function readNewLogBytes() {
  try {
    const fileSize = fs.statSync(logPath).size;
    if (fileSize < lastSize) {
      lineCarry = "";
      const restored = restoreInventoryBaseline(logPath);
      if (restored) lastSize = fs.statSync(logPath).size;
      else { lastSize = 0; slots.clear(); live.initialized = false; refreshValuation(); broadcastLive(); }
    }
    if (fileSize === lastSize) return;
    const amount = Math.min(fileSize - lastSize, 2 * 1024 * 1024);
    const buffer = Buffer.allocUnsafe(amount); const fd = fs.openSync(logPath, "r");
    const bytes = fs.readSync(fd, buffer, 0, amount, lastSize); fs.closeSync(fd);
    lastSize += bytes; parseChunk(buffer.subarray(0, bytes).toString("utf8"));
  } catch { logPath = null; }
}
function restoreInventoryBaseline(candidate) {
  const chunkSize = 8 * 1024 * 1024;
  const maxScan = 256 * 1024 * 1024;
  let text = ""; let found = false;
  try {
    const fd = fs.openSync(candidate, "r"); const size = fs.fstatSync(fd).size;
    try {
      for (let offset = size; offset > 0 && size - offset < maxScan;) {
        const amount = Math.min(chunkSize, offset); offset -= amount;
const buffer = Buffer.allocUnsafe(amount); fs.readSync(fd, buffer, 0, amount, offset);
        text = buffer.toString("utf8") + text;
        if (!found && /BagMgr@:(?:InitBagData|Modfy\s+BagItem|RemoveBagItem)|ItemChange@\s+Update/.test(text)) found = true;
      }
    } finally { fs.closeSync(fd); }
    if (!found) { slots.clear(); live.initialized = false; refreshValuation(); return false; }
    slots.clear();
    for (const match of text.matchAll(/BagMgr@:(InitBagData|Modfy\s+BagItem|RemoveBagItem)\s+PageId\s*=\s*(\d+)\s+SlotId\s*=\s*(\d+)(?:\s+ConfigBaseId\s*=\s*(\d+)\s+Num\s*=\s*(\d+))?|ItemChange@\s+Update\s+Id=(\d+)_\S+\s+BagNum=(\d+)\s+in\s+PageId=(\d+)\s+SlotId=(\d+)/g)) {
      if (match[1]) {
        const key = `${match[2]}:${match[3]}`;
        if (match[1].startsWith("Remove")) slots.delete(key);
        else slots.set(key, { configId: Number(match[4]), quantity: Number(match[5]) });
      } else {
        slots.set(`${match[8]}:${match[9]}`, { configId: Number(match[6]), quantity: Number(match[7]) });
      }
    }
    live.initialized = slots.size > 0;
    refreshValuation();
    const levels = [...text.matchAll(/LevelMgr@\s+LevelUid,\s*LevelType,\s*LevelId\s*=\s*(\d+)\s+(\d+)\s+(\d+)/g)];
    const zones = [...text.matchAll(/SceneLevelMgr@\s+OpenMainWorld\s+END!\s+InMainLevelPath\s*=\s*(.+)/g)];
    if (zones.length) {
      const raw = zones.at(-1)[1].trim();
      const lastLevel = levels.at(-1);
      const levelId = lastLevel ? Number(lastLevel[3]) : null;
      const levelType = lastLevel ? Number(lastLevel[2]) : null;
      const details = zoneDetails(raw, levelId);
      const tier = timemarkLabel(levelId, levelType, raw);
      let name = details.name;
      let resolvedLevelId = levelId;
      let resolvedLevelType = levelType;
      if (levelType === 22 && zoneCatalog.parentOf?.[String(levelId)]) {
        const parent = zoneCatalog.parentOf[String(levelId)];
        name = zoneCatalog.levelIds?.[String(parent)] || details.name;
        resolvedLevelId = Number(parent);
        resolvedLevelType = 21;
      }
      live.zone = name;
      if (!details.hub) { live.currentMap = details.known ? name : (tier ? `${tier} Map` : "Netherrealm Map"); live.mapTier = tier; live.levelId = resolvedLevelId; live.levelType = resolvedLevelType; }
      else captureHubCostBaseline();
    }
    return live.initialized;
  } catch { return false; }
}
function connectLog(candidate) {
  if (!candidate || !validLog(candidate)) return false;
  if (watcher) clearInterval(watcher);
  logPath = candidate; restoreInventoryBaseline(logPath); lastSize = fs.statSync(logPath).size;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({ logPath }, null, 2));
  watcher = setInterval(() => { readNewLogBytes(); broadcastStatus(); }, 250);
  broadcastStatus(); return true;
}
function restoreOrLocate() {
  try { const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8")); if (connectLog(saved.logPath)) return; } catch {}
  connectLog(autoLocateLog());
}

const hasInstanceLock = app.requestSingleInstanceLock({ version: app.getVersion() });
if (!hasInstanceLock) {
  dialog.showErrorBox(
    "Xcatter is already running",
    `Close the existing Xcatter window completely, then open v${app.getVersion()} again. The version already running may be an older build.`,
  );
  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#0d0f0e",
    title: "Xcatter",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(here, "preload.cjs") },
  });
  mainWindow = win;

  win.loadFile(path.join(here, "web", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
  win.on("closed", () => { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close(); });
}

let overlayWindow = null;
let overlayDragBase = null;
let overlayStoredHeight = 560;
let overlayHeightLocked = false;
let mainWindow = null;

function createOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  overlayWindow = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 280,
    minHeight: 280,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(here, "preload.cjs") },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(here, "overlay.html"));
  const { workArea } = screen.getPrimaryDisplay();
  overlayWindow.setPosition(workArea.x + workArea.width - overlayWindow.getBounds().width - 24, workArea.y + 24);
  overlayWindow.on("closed", () => { overlayWindow = null; });
  return overlayWindow;
}

ipcMain.handle("overlay:openMini", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  const win = createOverlay();
  win.show();
  win.blur();
});
ipcMain.handle("overlay:restoreMain", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
});
ipcMain.handle("overlay:interactive", (_event, value) => { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setIgnoreMouseEvents(!value, { forward: true }); });
ipcMain.handle("overlay:drag", (_event, state) => {
  const win = overlayWindow;
  if (!win || win.isDestroyed()) return;
  if (state?.type === "start") {
    const [wx, wy] = win.getPosition();
    const p = screen.getCursorScreenPoint();
    overlayDragBase = { x: wx - p.x, y: wy - p.y };
  } else if (state?.type === "move" && overlayDragBase) {
    const p = screen.getCursorScreenPoint();
    win.setPosition(overlayDragBase.x + p.x, overlayDragBase.y + p.y);
  } else if (state?.type === "end") {
    overlayDragBase = null;
  }
});
ipcMain.handle("overlay:setHeight", (_event, msg) => {
  const win = overlayWindow;
  if (!win || win.isDestroyed()) return;
  if (msg?.restore) {
    overlayHeightLocked = false;
    const [w] = win.getSize();
    win.setSize(w, overlayStoredHeight, false);
    return;
  }
  if (!overlayHeightLocked) {
    overlayStoredHeight = win.getBounds().height;
    overlayHeightLocked = true;
  }
  const h = Math.max(200, Math.min(900, Math.round(Number(msg?.height) || overlayStoredHeight)));
  const [w] = win.getSize();
  win.setSize(w, h, false);
});

ipcMain.handle("log:autoLocate", () => { const found = autoLocateLog(); if (found) connectLog(found); return status(); });
ipcMain.handle("app:getInfo", () => ({ version: app.getVersion(), dataPath: app.getPath("userData") }));
ipcMain.handle("updates:getStatus", () => publicUpdateStatus());
ipcMain.handle("updates:check", () => checkForUpdates(true));
ipcMain.handle("updates:download", () => downloadUpdate());
ipcMain.handle("updates:install", () => installUpdate());
ipcMain.handle("log:getStatus", () => status());
ipcMain.handle("log:getLive", () => live);
  ipcMain.handle("session:setPaused", (_event, paused) => setPaused(Boolean(paused)));
  ipcMain.handle("session:reset", () => resetSession());
ipcMain.handle("prices:getStatus", () => priceSync);
ipcMain.handle("prices:sync", () => syncTITrackPrices());
ipcMain.handle("prices:export", async () => {
  const result = await dialog.showSaveDialog({ title: "Share Afterlight prices", defaultPath: `Xcatter-Afterlight-Prices-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "Xcatter price file", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(exportPricePayload(), null, 2));
  return { canceled: false, path: result.filePath, count: Object.keys(prices).length };
});
ipcMain.handle("prices:import", async () => {
  const result = await dialog.showOpenDialog({ title: "Import prices from friends", properties: ["openFile", "multiSelections"], filters: [{ name: "JSON price files", extensions: ["json"] }] });
  if (result.canceled) return { canceled: true, imported: 0 };
  let imported = 0;
  for (const file of result.filePaths) {
    try { imported += importPricePayload(JSON.parse(fs.readFileSync(file, "utf8")), `file:${crypto.createHash("sha256").update(path.basename(file)).digest("hex").slice(0, 12)}`); } catch {}
  }
  return { canceled: false, imported, files: result.filePaths.length };
});
ipcMain.handle("cloud:getConfig", () => ({ endpoint: cloudConfig.endpoint, season: cloudConfig.season, hasKey: Boolean(cloudConfig.sharingKey) }));
ipcMain.handle("cloud:getStatus", () => cloudStatus);
ipcMain.handle("cloud:save", (_event, next) => {
  const endpoint = String(next?.endpoint || "").trim().replace(/\/$/, "");
  if (endpoint && !/^https:\/\//i.test(endpoint)) return { ok: false, error: "Use an https:// Worker URL" };
  cloudConfig = { endpoint, sharingKey: String(next?.sharingKey || cloudConfig.sharingKey || ""), season: "ss13-afterlight" };
  fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(cloudFile, JSON.stringify(cloudConfig, null, 2));
  if (endpoint && cloudConfig.sharingKey) syncCommunityPrices();
  return { ok: true, endpoint, hasKey: Boolean(cloudConfig.sharingKey) };
});
ipcMain.handle("cloud:sync", async () => { await Promise.allSettled([syncCommunityPrices(), syncTITrackNinja()]); return cloudStatus; });
ipcMain.handle("log:choose", async () => {
  const result = await dialog.showOpenDialog({ title: "Choose Torchlight real-time log", properties: ["openFile"], filters: [{ name: "Torchlight log", extensions: ["log"] }] });
  if (!result.canceled && result.filePaths[0]) connectLog(result.filePaths[0]);
  return status();
});
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.startsWith("https://cdn.tlidb.com/")) callback({ requestHeaders: { ...details.requestHeaders, Referer: "https://cdn.tlidb.com/" } });
    else callback({ requestHeaders: details.requestHeaders });
  });
  createWindow(); restoreOrLocate();
  setTimeout(syncTITrackPrices, 1500);
  priceSyncTimer = setInterval(syncTITrackPrices, PRICE_SYNC_INTERVAL_MS);
  setTimeout(syncCommunityPrices, 2500);
  cloudSyncTimer = setInterval(syncCommunityPrices, CLOUD_SYNC_INTERVAL_MS);
  setTimeout(syncTITrackNinja, 3000);
  ninjaSyncTimer = setInterval(syncTITrackNinja, NINJA_SYNC_INTERVAL_MS);
  setTimeout(checkForUpdates, 5000);
  updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portableFile) setTimeout(() => {
    try {
      const stateFile = path.join(app.getPath("userData"), "Updates", "swap.state");
      try {
        const state = fs.readFileSync(stateFile, "utf8").trim();
        updatesLog(`boot: swap state=${state}`);
        if (["failed", "swapping"].includes(state)) {
          const backup = `${portableFile}.previous`;
          if (fs.existsSync(backup)) {
            try {
              fs.rmSync(portableFile, { force: true });
              fs.renameSync(backup, portableFile);
              updatesLog("boot: restored previous executable after interrupted swap");
            } catch (error) { updatesLog(`boot: restore failed ${error?.message}`); }
          }
        }
      } catch {}
      try { fs.rmSync(stateFile, { force: true }); } catch {}
      fs.rmSync(`${portableFile}.previous`, { force: true });
      updatesLog("boot: portable update cleanup done");
    } catch {}
  }, 10000);
  const lastUpdateError = readLastError();
  if (lastUpdateError) {
    const stored = { ...updateStatus };
    if (!["downloading", "ready", "installing", "checking"].includes(stored.status)) {
      updatesLog(`boot: surfacing last update error: ${lastUpdateError}`);
      setUpdateStatus({ status: "error", message: `Last update attempt failed: ${lastUpdateError}`, progress: 0, latestVersion: stored.latestVersion });
    }
  }
});
app.on("second-instance", (_event, _argv, _workingDirectory, additionalData) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  if (additionalData?.version && additionalData.version !== app.getVersion()) {
    dialog.showMessageBox(win, {
      type: "warning",
      title: "A newer Xcatter was opened",
      message: `Xcatter v${app.getVersion()} is still running.`,
      detail: `Close this version completely, then open Xcatter v${additionalData.version} again.`,
      buttons: ["OK"],
    });
  }
});
app.on("window-all-closed", () => { if (priceSyncTimer) clearInterval(priceSyncTimer); if (cloudSyncTimer) clearInterval(cloudSyncTimer); if (updateCheckTimer) clearInterval(updateCheckTimer); if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
