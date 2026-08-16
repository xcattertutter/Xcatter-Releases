const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("torchtrack", {
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  getLogStatus: () => ipcRenderer.invoke("log:getStatus"),
  getLive: () => ipcRenderer.invoke("log:getLive"),
  setPaused: (value) => ipcRenderer.invoke("session:setPaused", value),
  resetSession: () => ipcRenderer.invoke("session:reset"),
  autoLocateLog: () => ipcRenderer.invoke("log:autoLocate"),
  chooseLog: () => ipcRenderer.invoke("log:choose"),
  getPriceSyncStatus: () => ipcRenderer.invoke("prices:getStatus"),
  syncPrices: () => ipcRenderer.invoke("prices:sync"),
  exportPrices: () => ipcRenderer.invoke("prices:export"),
  importPrices: () => ipcRenderer.invoke("prices:import"),
  getCloudConfig: () => ipcRenderer.invoke("cloud:getConfig"),
  getCloudStatus: () => ipcRenderer.invoke("cloud:getStatus"),
  saveCloud: (value) => ipcRenderer.invoke("cloud:save", value),
  syncCloud: () => ipcRenderer.invoke("cloud:sync"),
  getUpdateStatus: () => ipcRenderer.invoke("updates:getStatus"),
  setOverlayInteractive: (value) => ipcRenderer.invoke("overlay:interactive", value),
  overlayDrag: (state) => ipcRenderer.invoke("overlay:drag", state),
  setOverlayHeight: (msg) => ipcRenderer.invoke("overlay:setHeight", msg),
  openMini: () => ipcRenderer.invoke("overlay:openMini"),
  restoreMain: () => ipcRenderer.invoke("overlay:restoreMain"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onLogStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("log:status", listener);
    return () => ipcRenderer.removeListener("log:status", listener);
  },
  onLive: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("log:live", listener);
    return () => ipcRenderer.removeListener("log:live", listener);
  },
  onPriceSyncStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("prices:status", listener);
    return () => ipcRenderer.removeListener("prices:status", listener);
  },
  onCloudStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("cloud:status", listener);
    return () => ipcRenderer.removeListener("cloud:status", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  },
});
