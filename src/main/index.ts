import { app, BrowserWindow, shell } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { registerIpc, registerJobHandlers } from './ipc'
import { appDirs } from './services/appPaths'
import { initDb } from './db'

const e2eMode = process.env.SNIFFER_E2E_AI === '1' ? 'ai' : process.env.SNIFFER_E2E === '1' ? 'full' : ''

// Use %APPDATA%\Sniffer for user data regardless of packaged product name.
app.setName('Sniffer')
app.setAppUserModelId('com.sniffer.desktop')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  appDirs() // create logs/exports/cache/backups folders up front

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1060,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Sniffer',
    backgroundColor: '#0f1420',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open target=_blank / window.open externally, never in-app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    initDb() // apply schema migrations before any IPC handler touches the DB
    registerIpc()
    registerJobHandlers()

    if (e2eMode) {
      const outFile = join(app.getPath('temp'), 'sniffer-e2e-result.json')
      try {
        const { runE2e, runE2eAi } = await import('./e2e')
        const report = e2eMode === 'ai' ? await runE2eAi() : await runE2e()
        writeFileSync(outFile, JSON.stringify({ ok: true, report }, null, 2), 'utf-8')
        app.exit(0)
      } catch (err) {
        writeFileSync(
          outFile,
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2),
          'utf-8'
        )
        app.exit(1)
      }
      return
    }

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
