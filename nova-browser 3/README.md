# NOVA Browser 1.1

A minimalist desktop browser starter built with Electron and Chromium.

## Run
Requires Node.js 20+ and npm.

```bash
npm install
npm start
```

## Build an app
```bash
npm run dist
```
Build on the operating system you intend to package for.

## Features
- Chromium-based real web browsing
- Tabs, address bar, search, back/forward/reload
- Private tabs using isolated, temporary Electron sessions
- Dark mode
- Download manager with save dialogs and saved download list
- Local browsing history (private tabs excluded)
- NOVA new-tab homepage and Google homepage option
- Settings panel for theme, homepage, search engine, and clearing history
- Bookmarks stored locally

## Privacy and security notes
Private tabs use a separate in-memory Electron session with cache disabled, and NOVA does not add their navigations to its local history. This is not a guarantee of anonymity: websites, network providers, employers/schools, and downloaded files may still reveal activity. Downloaded files are saved normally. The browser denies website permission requests by default. This is an early project, not a hardened replacement for a major browser. Review dependencies and security settings before public distribution.
