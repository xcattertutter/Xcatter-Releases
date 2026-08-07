const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("torchtrack", {
  getLogStatus: () => ipcRenderer.invoke("log:getStatus"),
  getLive: () => ipcRenderer.invoke("log:getLive"),
  autoLocateLog: () => ipcRenderer.invoke("log:autoLocate"),
  chooseLog: () => ipcRenderer.invoke("log:choose"),
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
});
