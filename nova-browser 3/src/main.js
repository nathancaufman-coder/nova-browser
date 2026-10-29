const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let win;
let tabs = [];
let activeTabId = null;
let nextId = 1;
const TOOLBAR_HEIGHT = 112;
const historyFile = () => path.join(app.getPath("userData"), "history.json");
const downloadsFile = () => path.join(app.getPath("userData"), "downloads.json");
let historyItems = [];
let downloadItems = [];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); } catch {}
}
function pushHistory(tab, url) {
  if (tab.private || !url || url === "about:blank" || url.startsWith("devtools://")) return;
  const entry = { title: tab.title || url, url, visitedAt: new Date().toISOString() };
  historyItems.unshift(entry);
  historyItems = historyItems.slice(0, 500);
  writeJson(historyFile(), historyItems);
  if (win && !win.isDestroyed()) win.webContents.send("browser:history", historyItems);
}
function sendDownloads() {
  if (win && !win.isDestroyed()) win.webContents.send("browser:downloads", downloadItems);
}
function sendState() {
  if (!win || win.isDestroyed()) return;
  const active = tabs.find(t => t.id === activeTabId);
  win.webContents.send("browser:state", {
    tabs: tabs.map(t => ({
      id: t.id, title: t.title || (t.private ? "Private Tab" : "New Tab"),
      url: t.url || "", loading: !!t.loading, private: !!t.private,
      canGoBack: t.view.webContents.navigationHistory.canGoBack(),
      canGoForward: t.view.webContents.navigationHistory.canGoForward()
    })),
    activeTabId,
    active: active ? {
      id: active.id, title: active.title || "New Tab", url: active.url || "",
      loading: !!active.loading, private: !!active.private,
      canGoBack: active.view.webContents.navigationHistory.canGoBack(),
      canGoForward: active.view.webContents.navigationHistory.canGoForward()
    } : null
  });
}
function layoutViews() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  for (const tab of tabs) {
    tab.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
    tab.view.setVisible(tab.id === activeTabId);
  }
}
function normalizeAddress(input) {
  const value = String(input || "").trim();
  if (!value) return "https://www.google.com";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(value) && !/\s/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
function novaHomeUrl(isPrivate = false) {
  const heading = isPrivate ? "Private browsing" : "A little space for the web.";
  const subtitle = isPrivate
    ? "This window won't add pages to NOVA history."
    : "Search the web, or jump back into your favourites.";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <style>body{margin:0;background:#f6f7f8;color:#20242b;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh}
  main{width:min(620px,88vw);text-align:center;margin-top:-8vh}.mark{color:#5367e8;font-size:34px;margin-bottom:12px}h1{font-size:36px;letter-spacing:-1.8px;margin:0 0 10px}p{color:#858b95;margin:0 0 28px}
  form{display:flex;padding:7px;border:1px solid #e8eaed;background:white;border-radius:13px;box-shadow:0 8px 35px #20242b0a}input{flex:1;min-width:0;border:0;outline:0;padding:10px;font-size:14px}button{border:0;background:#5367e8;color:white;border-radius:9px;padding:0 20px;cursor:pointer}
  nav{display:flex;justify-content:center;gap:10px;margin-top:22px;flex-wrap:wrap}a{color:#69717d;text-decoration:none;background:white;border:1px solid #e8eaed;border-radius:9px;padding:10px 14px;font-size:12px}a:hover{border-color:#c7cef9}</style></head>
  <body><main><div class="mark">✦</div><h1>NOVA</h1><p>${subtitle}</p><form id="search"><input id="q" autofocus placeholder="Search the web or enter an address"><button>Search</button></form>
  <nav><a href="https://www.google.com">Google</a><a href="https://www.youtube.com">YouTube</a><a href="https://www.wikipedia.org">Wikipedia</a></nav></main>
  <script>document.getElementById('search').addEventListener('submit',function(e){e.preventDefault();const q=document.getElementById('q').value.trim();if(!q)return;location.href=/^(https?:\\\\/\\\\/|[\\\\w-]+(\\\\.[\\\\w-]+)+)/i.test(q)?(q.startsWith('http')?q:'https://'+q):'https://www.google.com/search?q='+encodeURIComponent(q);});</script></body></html>`;
  return "data:text/html;charset=UTF-8," + encodeURIComponent(html);
}
function attachDownloadHandler(ses, isPrivate) {
  ses.on("will-download", async (_event, item) => {
    const suggested = item.getFilename();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save download",
      defaultPath: suggested
    });
    if (canceled || !filePath) { item.cancel(); return; }
    item.setSavePath(filePath);
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      filename: path.basename(filePath), path: filePath,
      url: item.getURL(), state: "progressing", received: 0, total: item.getTotalBytes(),
      private: !!isPrivate, startedAt: new Date().toISOString()
    };
    if (!isPrivate) {
      downloadItems.unshift(record);
      downloadItems = downloadItems.slice(0, 100);
      writeJson(downloadsFile(), downloadItems);
    }
    const update = () => {
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes();
      if (!isPrivate) sendDownloads();
    };
    item.on("updated", (_e, state) => {
      update();
      if (state === "interrupted") record.state = "interrupted";
      else record.state = "progressing";
    });
    item.once("done", (_e, state) => {
      record.state = state;
      update();
      if (!isPrivate) {
        writeJson(downloadsFile(), downloadItems);
        sendDownloads();
      }
    });
    update();
  });
}
function createTab(url = "https://www.google.com", isPrivate = false) {
  const id = nextId++;
  const ses = isPrivate
    ? session.fromPartition(`nova-private-${id}`, { cache: false })
    : session.defaultSession;
  if (isPrivate) attachDownloadHandler(ses, true);
  const view = new WebContentsView({
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  const tab = { id, view, title: isPrivate ? "Private Tab" : "New Tab", url, loading: true, private: isPrivate };
  tabs.push(tab);
  win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: target }) => {
    createTab(target, isPrivate);
    return { action: "deny" };
  });
  wc.on("will-navigate", (_event, target) => { tab.url = target; sendState(); });
  wc.on("page-title-updated", (_event, title) => { tab.title = title; sendState(); });
  wc.on("did-navigate", (_event, target) => { tab.url = target; tab.loading = false; pushHistory(tab, target); sendState(); });
  wc.on("did-navigate-in-page", (_event, target) => { tab.url = target; sendState(); });
  wc.on("did-start-loading", () => { tab.loading = true; sendState(); });
  wc.on("did-stop-loading", () => { tab.loading = false; tab.url = wc.getURL(); sendState(); });
  wc.on("render-process-gone", () => { tab.loading = false; tab.title = "Page crashed"; sendState(); });
  setActiveTab(id);
  wc.loadURL(url === "nova://home" || url === "nova://private" ? novaHomeUrl(isPrivate) : normalizeAddress(url)).catch(() => {});
  return id;
}
function setActiveTab(id) { activeTabId = id; layoutViews(); sendState(); }
function getActiveTab() { return tabs.find(t => t.id === activeTabId); }
function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  win.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  if (activeTabId === id) {
    const next = tabs[Math.max(0, index - 1)] || tabs[0];
    if (next) activeTabId = next.id;
    else { createTab(); return; }
  }
  layoutViews(); sendState();
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 800, minHeight: 560,
    backgroundColor: "#f6f7f8", title: "NOVA Browser",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("resize", layoutViews);
  win.on("closed", () => { tabs = []; win = null; });
  win.webContents.on("did-finish-load", () => { createTab("nova://home"); layoutViews(); });
}
ipcMain.handle("browser:new-tab", (_e, url) => createTab(url || "nova://home", false));
ipcMain.handle("browser:new-private-tab", (_e, url) => createTab(url || "nova://private", true));
ipcMain.handle("browser:close-tab", (_e, id) => closeTab(id));
ipcMain.handle("browser:activate-tab", (_e, id) => setActiveTab(id));
ipcMain.handle("browser:navigate", (_e, value) => {
  const tab = getActiveTab(); if (!tab) return;
  const target = value === "nova://home" || value === "nova://private" ? novaHomeUrl(tab.private) : normalizeAddress(value);
  tab.url = value.startsWith("nova://") ? value : target;
  tab.view.webContents.loadURL(target).catch(() => {});
});
ipcMain.handle("browser:back", () => { const wc = getActiveTab()?.view.webContents; if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.handle("browser:forward", () => { const wc = getActiveTab()?.view.webContents; if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.handle("browser:reload", () => getActiveTab()?.view.webContents.reload());
ipcMain.handle("browser:home", () => getActiveTab()?.view.webContents.loadURL("https://www.google.com"));
ipcMain.handle("browser:get-history", () => historyItems);
ipcMain.handle("browser:clear-history", () => { historyItems = []; writeJson(historyFile(), historyItems); if (win) win.webContents.send("browser:history", historyItems); return true; });
ipcMain.handle("browser:get-downloads", () => downloadItems);
ipcMain.handle("browser:open-download", (_e, file) => shell.openPath(file));
ipcMain.handle("browser:show-download", (_e, file) => shell.showItemInFolder(file));
ipcMain.handle("browser:settings", () => ({ userData: app.getPath("userData") }));

app.whenReady().then(() => {
  historyItems = readJson(historyFile(), []);
  downloadItems = readJson(downloadsFile(), []);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  attachDownloadHandler(session.defaultSession, false);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
