const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    // When packaged, spawning the app executable with server.js will re-run
    // the packaged binary and can cause a spawn loop. Instead require the
    // server module directly in the main process for packaged builds.
    if (app.isPackaged) {
      try {
        require(path.join(__dirname, 'server.js'));
        resolve();
      } catch (err) {
        console.error('Failed to require server.js in packaged app:', err);
        reject(err);
      }
      return;
    }

    // Spawn node/electron to run server.js from project root during development
    serverProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: process.env,
    });

    let resolved = false;

    function tryResolve() {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }

    serverProc.stdout.on('data', (data) => {
      const text = data.toString();
      console.log('[server]', text.trim());
      if (text.includes('Server running at')) {
        tryResolve();
      }
    });

    serverProc.stderr.on('data', (data) => {
      console.error('[server]', data.toString().trim());
    });

    serverProc.on('error', (err) => {
      console.error('Failed to start server process:', err);
      reject(err);
    });

    // Fallback: if server doesn't print expected line, resolve after 3s
    setTimeout(tryResolve, 3000);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'public', 'icon', 'adb.png'),
  });

  const port = process.env.PORT || 3000;
  win.loadURL(`http://localhost:${port}`);
  // ensure menu bar is hidden (prevents Alt reveal on some platforms)
  try { win.setMenuBarVisibility(false); } catch (e) { }
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    console.error('Error starting server:', err);
  }
  // remove application menu for a clean, menu-less window
  try { Menu.setApplicationMenu(null); } catch (e) { }
  // on macOS set the dock icon as well
  try {
    if (process.platform === 'darwin' && app.dock && typeof app.dock.setIcon === 'function') {
      app.dock.setIcon(path.join(__dirname, 'public', 'icon', 'adb.png'));
    }
  } catch (e) { }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch (e) {
      // ignore
    }
    serverProc = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
