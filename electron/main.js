'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

// In dev mode (running with `electron .`, not packaged), point to the Next.js
// dev server. In production, spawn the standalone server ourselves.
const isDev = !app.isPackaged;

// Fixed port so that localStorage (scoped by origin) always points to the same
// data — avoids "losing" comparison history on restart.
const PREFERRED_PORT = 37823;
const MAX_PORT_TRIES = 5;
const STARTUP_TIMEOUT_MS = 60_000;

let mainWindow = null;
let nextProcess = null;
let serverPort = null;

// ── Single-instance lock ──────────────────────────────────────────────────────
// Prevents two copies of the app running at the same time (which would fight
// over the fixed port).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── Port utilities ────────────────────────────────────────────────────────────

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

async function findPort(preferred, maxTries) {
  for (let i = 0; i < maxTries; i++) {
    if (await isPortFree(preferred + i)) return preferred + i;
  }
  throw new Error(
    `포트 ${preferred}–${preferred + maxTries - 1} 범위에 사용 가능한 포트가 없습니다.`
  );
}

// ── Server-readiness poll ─────────────────────────────────────────────────────

function waitForServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function attempt() {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.destroy();
        resolve();
      });
      req.setTimeout(1_000);
      req.on('timeout', () => req.destroy());
      req.on('error', () => {
        if (Date.now() - started >= timeoutMs) {
          reject(new Error('서버 시작 타임아웃 (60초 초과)'));
          return;
        }
        setTimeout(attempt, 500);
      });
    }

    attempt();
  });
}

// ── Start Next.js standalone server ──────────────────────────────────────────

async function startNextServer() {
  if (isDev) {
    // Assume `npm run dev` is already running on port 3000.
    serverPort = parseInt(process.env.DEV_PORT || '3000', 10);
    return;
  }

  serverPort = await findPort(PREFERRED_PORT, MAX_PORT_TRIES);

  // The standalone build is placed in resources/next-server/ by electron-builder.
  const serverScript = path.join(process.resourcesPath, 'next-server', 'server.js');

  // Documents are persisted in the OS user-data folder so they survive updates.
  const storageRoot = path.join(app.getPath('userData'), 'documents');

  // ELECTRON_RUN_AS_NODE=1 makes the Electron executable behave as plain Node
  // when spawned as a child process — required because process.execPath points
  // to the Electron binary, not a standalone Node binary.
  nextProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(serverPort),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      DOCUMENT_STORAGE_ROOT: storageRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  nextProcess.stdout?.on('data', (d) => process.stdout.write('[next] ' + d));
  nextProcess.stderr?.on('data', (d) => process.stderr.write('[next] ' + d));

  nextProcess.on('error', (err) => {
    console.error('[next] 스폰 오류:', err.message);
  });

  nextProcess.on('exit', (code, signal) => {
    console.log(`[next] 프로세스 종료 (code=${code}, signal=${signal})`);
    nextProcess = null;
  });

  await waitForServer(serverPort, STARTUP_TIMEOUT_MS);
}

// ── BrowserWindow ─────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'Doc Comparator',
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the system default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isLocal = url.startsWith(`http://127.0.0.1:${serverPort}`);
    if (!isLocal) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith(`http://127.0.0.1:${serverPort}`);
    if (!isLocal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (err) {
    console.error('서버 시작 실패:', err);
    await dialog.showErrorBox(
      'Doc Comparator 시작 실패',
      `내장 서버를 시작하지 못했습니다.\n\n${err.message}`
    );
    app.quit();
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }
});
