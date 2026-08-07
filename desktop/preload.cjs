const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("torchtrack", {
  getLogStatus: () => ipcRenderer.invoke("log:getStatus"),
  autoLocateLog: () => ipcRenderer.invoke("log:autoLocate"),
  chooseLog: () => ipcRenderer.invoke("log:choose"),
  onLogStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("log:status", listener);
    return () => ipcRenderer.removeListener("log:status", listener);
  },
});
