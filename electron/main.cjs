const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// l'audio parte senza gesto dell'utente; il rendering non rallenta in background
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// grafica: usa la GPU (anche se in blocklist), preferisce quella dedicata sui portatili ibridi
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// i dati reali (quote, OpenStreetMap) si leggono con XMLHttpRequest da file://
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#bcd7ee',
    title: 'VolareSIM',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // F11: schermo intero
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
