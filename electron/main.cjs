const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    title: '九点熄灯',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))

  // Used by the packaging check: print what rendered, then quit.
  if (process.env.JIUDIAN_SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      const text = await win.webContents.executeJavaScript('document.body.innerText')
      process.stdout.write('SMOKE:' + JSON.stringify(text) + '\n')
      app.exit(0)
    })
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      process.stdout.write('SMOKE-FAIL:' + code + ' ' + desc + '\n')
      app.exit(1)
    })
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
