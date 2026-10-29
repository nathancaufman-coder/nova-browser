const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nova", {
  newTab: url => ipcRenderer.invoke("browser:new-tab", url),
  newPrivateTab: url => ipcRenderer.invoke("browser:new-private-tab", url),
  closeTab: id => ipcRenderer.invoke("browser:close-tab", id),
  activateTab: id => ipcRenderer.invoke("browser:activate-tab", id),
  navigate: value => ipcRenderer.invoke("browser:navigate", value),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  home: () => ipcRenderer.invoke("browser:home"),
  getHistory: () => ipcRenderer.invoke("browser:get-history"),
  clearHistory: () => ipcRenderer.invoke("browser:clear-history"),
  getDownloads: () => ipcRenderer.invoke("browser:get-downloads"),
  openDownload: file => ipcRenderer.invoke("browser:open-download", file),
  showDownload: file => ipcRenderer.invoke("browser:show-download", file),
  onState: callback => { ipcRenderer.removeAllListeners("browser:state"); ipcRenderer.on("browser:state", (_e, state) => callback(state)); },
  onHistory: callback => { ipcRenderer.removeAllListeners("browser:history"); ipcRenderer.on("browser:history", (_e, items) => callback(items)); },
  onDownloads: callback => { ipcRenderer.removeAllListeners("browser:downloads"); ipcRenderer.on("browser:downloads", (_e, items) => callback(items)); }
});
