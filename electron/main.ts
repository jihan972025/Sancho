import { app, BrowserWindow, ipcMain, Menu, Tray, dialog, nativeImage } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { initWhatsApp, connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, sendWhatsAppMessage } from './whatsapp'
import { initTelegram, connectTelegram, disconnectTelegram, getTelegramStatus, sendTelegramMessage } from './telegram'
import { initMatrix, connectMatrix, disconnectMatrix, getMatrixStatus, sendMatrixMessage } from './matrix'
import { initSlack, connectSlack, disconnectSlack, getSlackStatus, sendSlackMessage } from './slack'
import { initDiscord, connectDiscord, disconnectDiscord, getDiscordStatus, sendDiscordMessage } from './discord'
import { setSelectedModel } from './selectedModel'
import { startPeriodicCheck, stopPeriodicCheck, checkForUpdate, applyPatch, dismissUpdate } from './updater'
import { startGoogleOAuth } from './googleAuth'
import { startOutlookOAuth } from './outlookAuth'
import { startTunnel, stopTunnel, getTunnelUrl } from './tunnel'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let notificationPollTimer: ReturnType<typeof setInterval> | null = null
let tradePollTimer: ReturnType<typeof setInterval> | null = null
let tray: Tray | null = null
let isQuitting = false

const isDev = !app.isPackaged

/** Return patched version from patch-version.json, falling back to app.getVersion(). */
function getDisplayVersion(): string {
  try {
    const pvPath = path.join(process.resourcesPath, 'patch-version.json')
    const pv = JSON.parse(fs.readFileSync(pvPath, 'utf-8'))
    if (pv.version) return pv.version
  } catch { /* ignore */ }
  return app.getVersion()
}

function findPythonBackend(): { command: string; args: string[] } {
  if (isDev) {
    // Development: run python directly
    return {
      command: 'python',
      args: ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8765'],
    }
  }
  // Production: use PyInstaller-built executable
  const backendPath = path.join(process.resourcesPath, 'backend', 'main.exe')
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

  const playwrightCliJs = isDev
    ? path.join(__dirname, '..', 'node_modules', '@playwright', 'cli', 'playwright-cli.js')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@playwright', 'cli', 'playwright-cli.js')

  // In production, use Electron's bundled node; in dev, use system node
  const nodePath = isDev ? 'node' : process.execPath

  pythonProcess = spawn(command, args, {
    cwd: isDev ? path.join(__dirname, '..') : process.resourcesPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SANCHO_PLAYWRIGHT_CLI_JS: playwrightCliJs,
      SANCHO_PLAYWRIGHT_NODE: nodePath,
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
    ? path.join(__dirname, '..', 'img', 'android-chrome-192x192.webp')
    : path.join(process.resourcesPath, 'assets', 'app-icon.webp')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `Sancho v${getDisplayVersion()}`,
    icon: titlebarIcon,
    frame: true,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: isDev
        ? path.join(__dirname, 'preload.js')
        : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,   // Required: file:// → http://127.0.0.1:8765 API calls
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
    mainWindow.loadFile(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

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

    // Slack auto-connect
    if (config.slack?.enabled && config.api?.slack_bot_token && config.api?.slack_app_token) {
      console.log('[Slack] Auto-connecting (enabled in settings)...')
      connectSlack(config.api.slack_bot_token, config.api.slack_app_token).catch((err: Error) => console.log('[Slack] Auto-connect failed:', err.message))
    }

    // Discord auto-connect
    if (config.discord?.enabled && config.discord?.bot_token) {
      console.log('[Discord] Auto-connecting (enabled in settings)...')
      connectDiscord(config.discord.bot_token).catch((err: Error) => console.log('[Discord] Auto-connect failed:', err.message))
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
      if (apps.slack && getSlackStatus() === 'connected') {
        if (await sendSlackMessage(message)) sent = true
      }
      if (apps.discord && getDiscordStatus() === 'connected') {
        if (await sendDiscordMessage(message)) sent = true
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

// ── Auto-Trading Trade Notifications ──

const TRADE_POLL_INTERVAL = 10_000 // 10 seconds

function formatTradeNotification(notif: any): string {
  const data = notif.trade_data || {}
  const prefix = notif.source === 'manual' ? '[Manual Trade]' : '[Auto-Trading]'
  const time = new Date(notif.created_at).toLocaleString()

  if (notif.action === 'BUY') {
    const price = Number(data.price || 0).toLocaleString()
    const amount = Number(data.amount_krw || 0).toLocaleString()
    const qty = Number(data.quantity || 0).toFixed(8)
    return (
      `\u{1F7E2} ${prefix} BUY ${notif.coin}\n` +
      `Price: \u{20A9}${price}\n` +
      `Amount: \u{20A9}${amount}\n` +
      `Quantity: ${qty}\n` +
      `Time: ${time}`
    )
  }

  if (notif.action === 'SELL') {
    const lines: string[] = [`\u{1F534} ${prefix} SELL ${notif.coin}`]

    if (data.entry_price && data.exit_price) {
      const entry = Number(data.entry_price).toLocaleString()
      const exit = Number(data.exit_price).toLocaleString()
      lines.push(`Entry: \u{20A9}${entry} \u{2192} Exit: \u{20A9}${exit}`)
    } else {
      lines.push(`Price: \u{20A9}${Number(data.price || 0).toLocaleString()}`)
    }

    if (data.pnl_krw !== undefined && data.pnl_pct !== undefined) {
      const pnlKrw = Number(data.pnl_krw).toLocaleString()
      const pnlPct = Number(data.pnl_pct).toFixed(2)
      lines.push(`P&L: \u{20A9}${pnlKrw} (${pnlPct}%)`)
    }
    if (data.fee_krw !== undefined) {
      lines.push(`Fee: \u{20A9}${Number(data.fee_krw).toLocaleString()}`)
    }
    if (data.est_krw !== undefined) {
      lines.push(`Est: \u{20A9}${Number(data.est_krw).toLocaleString()}`)
    }

    const qty = Number(data.quantity || 0).toFixed(8)
    lines.push(`Quantity: ${qty}`)
    lines.push(`Time: ${time}`)

    return lines.join('\n')
  }

  return `${prefix} ${notif.action} ${notif.coin}`
}

async function pollTradeNotifications(): Promise<void> {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/autotrading/notifications`)
    if (!resp.ok) return
    const { notifications } = await resp.json()
    if (!notifications || notifications.length === 0) return

    const config = await fetchSettings()
    const ackedIds: string[] = []

    for (const notif of notifications) {
      const message = formatTradeNotification(notif)
      let sent = false

      if (config.whatsapp?.enabled && getWhatsAppStatus() === 'connected') {
        if (await sendWhatsAppMessage(message)) sent = true
      }
      if (config.telegram?.enabled && getTelegramStatus() === 'connected') {
        if (await sendTelegramMessage(message)) sent = true
      }
      if (config.matrix?.enabled && getMatrixStatus() === 'connected') {
        if (await sendMatrixMessage(message)) sent = true
      }
      if (config.slack?.enabled && getSlackStatus() === 'connected') {
        if (await sendSlackMessage(message)) sent = true
      }
      if (config.discord?.enabled && getDiscordStatus() === 'connected') {
        if (await sendDiscordMessage(message)) sent = true
      }

      if (sent) {
        ackedIds.push(notif.id)
        mainWindow?.webContents.send('autotrading:notification-sent', {
          action: notif.action,
          coin: notif.coin,
          source: notif.source,
        })
      }
    }

    if (ackedIds.length > 0) {
      await fetch(`${BACKEND_URL}/api/autotrading/notifications/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ackedIds }),
      })
      console.log(`[AutoTrading] Sent ${ackedIds.length} trade notification(s) to chat apps`)
    }
  } catch {
    // Silent fail — backend may not be ready yet
  }
}

function startTradeNotificationPolling(): void {
  if (tradePollTimer) return
  tradePollTimer = setInterval(pollTradeNotifications, TRADE_POLL_INTERVAL)
  pollTradeNotifications()
  console.log('[AutoTrading] Trade notification polling started (10s interval)')
}

function stopTradeNotificationPolling(): void {
  if (tradePollTimer) {
    clearInterval(tradePollTimer)
    tradePollTimer = null
  }
}

function createTray(): void {
  const trayIconPath = isDev
    ? path.join(__dirname, '..', 'assets', 'icon.ico')
    : path.join(process.resourcesPath, 'assets', 'icon.ico')

  const trayImage = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 })
  tray = new Tray(trayImage)
  tray.setToolTip(`Sancho v${getDisplayVersion()}`)

  const trayMenu = Menu.buildFromTemplate([
    {
      label: `Sancho v${getDisplayVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    {
      label: 'Auto Start',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked })
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(trayMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady().then(async () => {
  // Enable auto-start by default on first run (production only)
  if (!isDev) {
    const loginSettings = app.getLoginItemSettings()
    if (!loginSettings.openAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true })
    }
  }

  await startBackend()
  createWindow()
  createTray()

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `Sancho v${getDisplayVersion()}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'About Sancho',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Sancho',
              message: `Sancho v${getDisplayVersion()}`,
              detail: 'Windows AI Agent Desktop App\n\nhttps://github.com/jihan972025/sancho',
            })
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)

  if (mainWindow) {
    initWhatsApp(mainWindow)
    initTelegram(mainWindow)
    initMatrix(mainWindow)
    initSlack(mainWindow)
    initDiscord(mainWindow)

    // Auto-connect chat apps after renderer is ready (so IPC listeners are registered)
    mainWindow.webContents.on('did-finish-load', () => {
      autoConnectChatApps()
      startNotificationPolling()
      startTradeNotificationPolling()
    })

    // Start periodic update checks
    startPeriodicCheck(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Do not quit — keep running in tray
})

app.on('before-quit', () => {
  isQuitting = true
  stopPeriodicCheck()
  stopNotificationPolling()
  stopTradeNotificationPolling()
  stopTunnel()
  stopBackend()
  tray?.destroy()
  tray = null
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

// Slack IPC handlers
ipcMain.handle('slack:connect', (_event, botToken: string, appToken: string) => connectSlack(botToken, appToken))
ipcMain.handle('slack:disconnect', () => disconnectSlack())
ipcMain.handle('slack:status', () => getSlackStatus())

// Discord IPC handlers
ipcMain.handle('discord:connect', (_event, botToken: string) => connectDiscord(botToken))
ipcMain.handle('discord:disconnect', () => disconnectDiscord())
ipcMain.handle('discord:status', () => getDiscordStatus())

// Patch updater IPC handlers
ipcMain.handle('patch:check', async () => {
  return checkForUpdate()
})

ipcMain.handle('patch:apply', async () => {
  const result = await applyPatch((percent, channel) => {
    mainWindow?.webContents.send('patch:progress', { percent, channel })
  })
  if (result.success) {
    mainWindow?.webContents.send('patch:applied')
  }
  return result
})

ipcMain.handle('patch:dismiss', (_event, version: string) => {
  dismissUpdate(version)
})

ipcMain.handle('patch:restart', () => {
  app.relaunch()
  app.exit(0)
})

// Google OAuth IPC handlers
ipcMain.handle('google-auth:login', async () => {
  return startGoogleOAuth()
})

ipcMain.handle('google-auth:status', async () => {
  const http = await import('http')
  const data: string = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:8765/api/auth/google/status', (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    }).on('error', reject)
  })
  return JSON.parse(data)
})

// Tunnel IPC handlers
ipcMain.handle('tunnel:start', async () => {
  try {
    const url = await startTunnel()
    return { url, error: '' }
  } catch (err) {
    const msg = (err as Error).message
    console.error('[Tunnel] Start failed:', msg)
    return { url: '', error: msg }
  }
})
ipcMain.handle('tunnel:stop', async () => stopTunnel())
ipcMain.handle('tunnel:status', () => getTunnelUrl())

ipcMain.handle('google-auth:logout', async () => {
  const http = await import('http')
  await new Promise<void>((resolve, reject) => {
    const req = http.request('http://127.0.0.1:8765/api/auth/google/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      res.on('data', () => {})
      res.on('end', () => resolve())
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
})

// Outlook OAuth IPC handlers
ipcMain.handle('outlook-auth:login', async (_event, clientId: string, clientSecret: string) => {
  return startOutlookOAuth(clientId, clientSecret)
})

ipcMain.handle('outlook-auth:status', async () => {
  const http = await import('http')
  const data: string = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:8765/api/auth/outlook/status', (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    }).on('error', reject)
  })
  return JSON.parse(data)
})

ipcMain.handle('outlook-auth:logout', async () => {
  const http = await import('http')
  await new Promise<void>((resolve, reject) => {
    const req = http.request('http://127.0.0.1:8765/api/auth/outlook/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      res.on('data', () => {})
      res.on('end', () => resolve())
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
})
