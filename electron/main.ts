import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { initWhatsApp, connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, sendWhatsAppMessage } from './whatsapp'
import { initTelegram, connectTelegram, disconnectTelegram, getTelegramStatus, sendTelegramMessage } from './telegram'
import { initMatrix, connectMatrix, disconnectMatrix, getMatrixStatus, sendMatrixMessage } from './matrix'
import { setSelectedModel } from './selectedModel'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let notificationPollTimer: ReturnType<typeof setInterval> | null = null

const isDev = !app.isPackaged

function findPythonBackend(): { command: string; args: string[] } {
  if (isDev) {
    // Development: run python directly
    return {
      command: 'python',
      args: ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8765'],
    }
  }
  // Production: use PyInstaller-built executable
  const backendPath = path.join(process.resourcesPath, 'backend', 'main', 'main.exe')
  if (fs.existsSync(backendPath)) {
    return { command: backendPath, args: [] }
  }
  // Fallback: try python
  return {
    command: 'python',
    args: ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8765'],
  }
}

async function isBackendRunning(): Promise<boolean> {
  try {
    const http = await import('http')
    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:8765/api/health', (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(1000, () => { req.destroy(); resolve(false) })
    })
  } catch {
    return false
  }
}

async function startBackend(): Promise<void> {
  // Skip if backend is already running (e.g. started by start_electron.bat)
  if (await isBackendRunning()) {
    console.log('Backend already running on port 8765, skipping spawn')
    return
  }

  const { command, args } = findPythonBackend()
  console.log(`Starting backend: ${command} ${args.join(' ')}`)

  const playwrightCliPath = isDev
    ? path.join(__dirname, '..', 'node_modules', '.bin', 'playwright-cli.cmd')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', 'playwright-cli.cmd')

  pythonProcess = spawn(command, args, {
    cwd: isDev ? path.join(__dirname, '..') : process.resourcesPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SANCHO_PLAYWRIGHT_CLI_PATH: playwrightCliPath,
    },
  })

  pythonProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[Backend] ${data.toString().trim()}`)
  })

  pythonProcess.on('error', (err: Error) => {
    console.error('Failed to start backend:', err.message)
  })

  pythonProcess.on('exit', (code: number | null) => {
    console.log(`Backend exited with code ${code}`)
    pythonProcess = null
  })
}

function stopBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

function createWindow(): void {
  const titlebarIcon = isDev
    ? path.join(__dirname, '..', 'assets', 'titlebar-icon.ico')
    : path.join(process.resourcesPath, 'assets', 'titlebar-icon.ico')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `Sancho v${app.getVersion()}`,
    icon: titlebarIcon,
    frame: true,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    // Load splash screen first — it polls backend + Vite and redirects when ready
    const loadingPath = path.join(__dirname, '..', 'electron', 'loading.html')
    if (fs.existsSync(loadingPath)) {
      mainWindow.loadFile(loadingPath)
    } else {
      mainWindow.loadURL('http://localhost:5173')
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function fetchSettings(): Promise<any> {
  const http = await import('http')
  const data: string = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:8765/api/settings', (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    }).on('error', reject)
  })
  return JSON.parse(data)
}

async function autoConnectChatApps(): Promise<void> {
  try {
    const config = await fetchSettings()

    // WhatsApp auto-connect
    if (config.whatsapp?.enabled) {
      const waVersion = config.whatsapp.wa_version || undefined
      console.log('[WhatsApp] Auto-connecting (enabled in settings)...')
      connectWhatsApp(waVersion).catch((err: Error) => console.log('[WhatsApp] Auto-connect failed:', err.message))
    }

    // Telegram auto-connect
    if (config.telegram?.enabled && config.telegram?.api_id && config.telegram?.api_hash) {
      console.log('[Telegram] Auto-connecting (enabled in settings)...')
      connectTelegram(config.telegram.api_id, config.telegram.api_hash).catch((err: Error) => console.log('[Telegram] Auto-connect failed:', err.message))
    }

    // Matrix auto-connect
    if (config.matrix?.enabled && config.matrix?.user_id) {
      console.log('[Matrix] Auto-connecting (enabled in settings)...')
      connectMatrix(config.matrix.homeserver_url, config.matrix.user_id, config.matrix.password, config.matrix.access_token).catch((err: Error) => console.log('[Matrix] Auto-connect failed:', err.message))
    }
  } catch (err) {
    console.log('[ChatApps] Auto-connect skipped:', (err as Error).message)
  }
}

const BACKEND_URL = 'http://127.0.0.1:8765'
const POLL_INTERVAL = 30_000 // 30 seconds

async function pollSchedulerNotifications(): Promise<void> {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/scheduler/notifications`)
    if (!resp.ok) return
    const { notifications } = await resp.json()
    if (!notifications || notifications.length === 0) return

    const ackedIds: string[] = []

    for (const notif of notifications) {
      const header = `[${notif.task_name}]\n`
      // Trim long results for chat messages (max 3000 chars)
      const body = notif.result.length > 3000
        ? notif.result.substring(0, 3000) + '\n...(truncated)'
        : notif.result
      const message = header + body

      const apps = notif.notify_apps || {}
      let sent = false

      if (apps.whatsapp && getWhatsAppStatus() === 'connected') {
        if (await sendWhatsAppMessage(message)) sent = true
      }
      if (apps.telegram && getTelegramStatus() === 'connected') {
        if (await sendTelegramMessage(message)) sent = true
      }
      if (apps.matrix && getMatrixStatus() === 'connected') {
        if (await sendMatrixMessage(message)) sent = true
      }

      if (sent) {
        ackedIds.push(notif.id)
        // Also notify UI
        mainWindow?.webContents.send('scheduler:notification-sent', {
          task_name: notif.task_name,
          apps,
        })
      }
    }

    // Ack delivered notifications
    if (ackedIds.length > 0) {
      await fetch(`${BACKEND_URL}/api/scheduler/notifications/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ackedIds }),
      })
      console.log(`[Scheduler] Acked ${ackedIds.length} notification(s)`)
    }
  } catch (err) {
    // Silent fail — backend may not be ready yet
  }
}

function startNotificationPolling(): void {
  if (notificationPollTimer) return
  notificationPollTimer = setInterval(pollSchedulerNotifications, POLL_INTERVAL)
  // Also run immediately once
  pollSchedulerNotifications()
  console.log('[Scheduler] Notification polling started (30s interval)')
}

function stopNotificationPolling(): void {
  if (notificationPollTimer) {
    clearInterval(notificationPollTimer)
    notificationPollTimer = null
  }
}

app.whenReady().then(async () => {
  await startBackend()
  createWindow()

  if (mainWindow) {
    initWhatsApp(mainWindow)
    initTelegram(mainWindow)
    initMatrix(mainWindow)

    // Auto-connect chat apps after renderer is ready (so IPC listeners are registered)
    mainWindow.webContents.on('did-finish-load', () => {
      autoConnectChatApps()
      startNotificationPolling()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopNotificationPolling()
  stopBackend()
  app.quit()
})

app.on('before-quit', () => {
  stopNotificationPolling()
  stopBackend()
})

// IPC handlers
ipcMain.handle('get-app-path', () => app.getAppPath())
ipcMain.handle('is-dev', () => isDev)
ipcMain.handle('set-selected-model', (_event, model: string) => setSelectedModel(model))

// WhatsApp IPC handlers
ipcMain.handle('whatsapp:connect', (_event, waVersion?: string) => connectWhatsApp(waVersion))
ipcMain.handle('whatsapp:disconnect', () => disconnectWhatsApp())
ipcMain.handle('whatsapp:status', () => getWhatsAppStatus())

// Telegram IPC handlers
ipcMain.handle('telegram:connect', (_event, apiId: string, apiHash: string) => connectTelegram(apiId, apiHash))
ipcMain.handle('telegram:disconnect', () => disconnectTelegram())
ipcMain.handle('telegram:status', () => getTelegramStatus())

// Matrix IPC handlers
ipcMain.handle('matrix:connect', (_event, homeserverUrl: string, userId: string, password: string, accessToken: string) => connectMatrix(homeserverUrl, userId, password, accessToken))
ipcMain.handle('matrix:disconnect', () => disconnectMatrix())
ipcMain.handle('matrix:status', () => getMatrixStatus())
