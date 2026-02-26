/**
 * WhatsApp connection via Baileys.
 * Baileys is ESM-only, so we use dynamic import() to load it from CJS Electron.
 * The esmImport helper prevents TypeScript from converting import() to require().
 */

import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSelectedModel } from './selectedModel'

// Prevent TypeScript from converting dynamic import() to require()
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const esmImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>

type WAStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

let sock: any = null
let mainWin: BrowserWindow | null = null
let status: WAStatus = 'disconnected'
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let intentionalDisconnect = false
let lastWaVersion: string | undefined
const MAX_RECONNECT_ATTEMPTS = 5

const BACKEND_URL = 'http://127.0.0.1:8765'

// Deduplication: track recently processed incoming message IDs
const processedMsgIds = new Set<string>()
const MAX_PROCESSED_IDS = 500

function markProcessed(id: string): boolean {
  if (processedMsgIds.has(id)) return false  // already processed
  processedMsgIds.add(id)
  if (processedMsgIds.size > MAX_PROCESSED_IDS) {
    // Evict oldest entries
    const iter = processedMsgIds.values()
    for (let i = 0; i < 100; i++) iter.next()
    // Rebuild set without oldest 100
    const keep = [...processedMsgIds].slice(100)
    processedMsgIds.clear()
    keep.forEach(k => processedMsgIds.add(k))
  }
  return true  // first time seeing this message
}

// Message store for encryption retry handling
// When phone can't decrypt, WhatsApp requests a retry — Baileys needs the original message
const sentMessages = new Map<string, any>()
const MAX_STORED_MESSAGES = 200

function storeMessage(id: string, message: any): void {
  sentMessages.set(id, message)
  // Evict oldest if too many
  if (sentMessages.size > MAX_STORED_MESSAGES) {
    const oldest = sentMessages.keys().next().value
    if (oldest) sentMessages.delete(oldest)
  }
}

function getAuthDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return path.join(home, '.sancho', 'whatsapp-auth')
}

function ensureAuthDir(): void {
  const dir = getAuthDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function clearAuthDir(): void {
  const dir = getAuthDir()
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
    console.log('[WhatsApp] Auth state cleared')
  }
}

function setStatus(s: WAStatus, error?: string): void {
  status = s
  mainWin?.webContents.send('whatsapp:status-update', s, error)
}

export function initWhatsApp(win: BrowserWindow): void {
  mainWin = win
}

export async function connectWhatsApp(waVersion?: string): Promise<void> {
  if (sock) {
    return
  }

  intentionalDisconnect = false
  lastWaVersion = waVersion
  setStatus('connecting')
  ensureAuthDir()

  let baileys: any
  let pino: any
  let QRCode: any

  try {
    // Dynamic import for ESM-only packages (must use esmImport to avoid require())
    baileys = await esmImport('@whiskeysockets/baileys')
    pino = (await esmImport('pino')).default
    QRCode = await esmImport('qrcode')
  } catch (err) {
    console.error('[WhatsApp] Failed to load dependencies:', err)
    setStatus('disconnected', `Failed to load WhatsApp libraries: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  const makeWASocket = baileys.default
  const {
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers,
  } = baileys

  const logger = pino({ level: 'warn' })

  let state: any
  let saveCreds: any
  try {
    const auth = await useMultiFileAuthState(getAuthDir())
    state = auth.state
    saveCreds = auth.saveCreds
  } catch (err) {
    console.error('[WhatsApp] Failed to load auth state:', err)
    setStatus('disconnected', `Failed to load auth state: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // Resolve WhatsApp Web version:
  // 1) User-specified version from settings
  // 2) fetchLatestBaileysVersion() — fetches from GitHub
  // 3) fetchLatestWaWebVersion() — scrapes web.whatsapp.com
  // 4) Hardcoded fallback
  const { fetchLatestBaileysVersion, fetchLatestWaWebVersion } = baileys
  const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1027934701]

  let WA_VERSION: [number, number, number]

  if (waVersion) {
    // User explicitly set a version in settings
    const parts = waVersion.split(',').map((s: string) => parseInt(s.trim(), 10))
    WA_VERSION = [parts[0] || 2, parts[1] || 3000, parts[2] || FALLBACK_VERSION[2]]
    console.log(`[WhatsApp] Using user-specified version: ${WA_VERSION.join('.')}`)
  } else {
    // Auto-detect latest version
    try {
      const result = await fetchLatestBaileysVersion({ timeout: 5000 })
      if (result.isLatest && result.version) {
        WA_VERSION = result.version as [number, number, number]
        console.log(`[WhatsApp] Fetched latest Baileys version: ${WA_VERSION.join('.')}`)
      } else {
        throw new Error(result.error?.message || 'Not latest')
      }
    } catch (err1) {
      console.warn(`[WhatsApp] fetchLatestBaileysVersion failed: ${err1}. Trying fetchLatestWaWebVersion...`)
      try {
        const result2 = await fetchLatestWaWebVersion({ timeout: 5000 })
        if (result2.isLatest && result2.version) {
          WA_VERSION = result2.version as [number, number, number]
          console.log(`[WhatsApp] Fetched latest WA Web version: ${WA_VERSION.join('.')}`)
        } else {
          throw new Error(result2.error?.message || 'Not latest')
        }
      } catch (err2) {
        console.warn(`[WhatsApp] fetchLatestWaWebVersion also failed: ${err2}. Using fallback.`)
        WA_VERSION = FALLBACK_VERSION
        console.log(`[WhatsApp] Using fallback version: ${WA_VERSION.join('.')}`)
      }
    }
  }

  try {
  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version: WA_VERSION,
    logger,
    printQRInTerminal: false,
    browser: Browsers.windows('Sancho'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    // getMessage: needed for encryption retry when recipient can't decrypt
    getMessage: async (key: any) => {
      const stored = sentMessages.get(key.id)
      if (stored) {
        console.log(`[WhatsApp] getMessage retry for ${key.id}`)
        return stored
      }
      return undefined
    },
  })

  // Connection updates (QR, open, close)
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update
    console.log('[WhatsApp] connection.update:', JSON.stringify({ connection, qr: qr ? '(qr data)' : undefined, hasLastDisconnect: !!lastDisconnect }))

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { width: 256 })
        setStatus('qr')
        mainWin?.webContents.send('whatsapp:qr', dataUrl)
      } catch (err) {
        console.error('[WhatsApp] QR generation error:', err)
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0
      setStatus('connected')
      console.log('[WhatsApp] Connected')
    }

    if (connection === 'close') {
      const error = lastDisconnect?.error
      const statusCode = error?.output?.statusCode || error?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      console.log(`[WhatsApp] Disconnected. Status: ${statusCode}. Error: ${error?.message || 'unknown'}. Logged out: ${loggedOut}. Intentional: ${intentionalDisconnect}`)

      sock = null

      // User clicked Disconnect — do nothing
      if (intentionalDisconnect) {
        return
      }

      if (loggedOut) {
        // Clear auth state and reconnect fresh (new QR code)
        clearAuthDir()
        console.log('[WhatsApp] Reconnecting with fresh auth...')
        connectWhatsApp(lastWaVersion).catch(console.error)
      } else if (statusCode === DisconnectReason.restartRequired) {
        // Restart immediately
        connectWhatsApp(lastWaVersion).catch(console.error)
      } else if (statusCode === 405 && lastWaVersion) {
        // 405 = version outdated. Retry WITHOUT user-specified version to auto-detect.
        console.log('[WhatsApp] Version 405 error — retrying with auto-detected version')
        lastWaVersion = undefined
        connectWhatsApp(undefined).catch(console.error)
      } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        // Auto-reconnect with backoff
        reconnectAttempts++
        const delay = Math.min(reconnectAttempts * 3000, 15000)
        console.log(`[WhatsApp] Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`)
        setStatus('connecting')
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => {
          connectWhatsApp(lastWaVersion).catch(console.error)
        }, delay)
      } else {
        console.log('[WhatsApp] Max reconnect attempts reached. Giving up.')
        setStatus('disconnected', 'Connection failed after multiple attempts. Check your WhatsApp Web Version in settings or clear it for auto-detection.')
        reconnectAttempts = 0
      }
    }
  })

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds)

  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
    console.log(`[WhatsApp] messages.upsert: type=${type}, count=${messages.length}`)
    if (type !== 'notify') return

    // Get own JID dynamically (only available after connection is open)
    const myId = sock?.user?.id?.replace(/:.*@/, '@') || ''
    const myLid = sock?.user?.lid || ''

    for (const msg of messages) {
      const remoteJid = msg.key.remoteJid || ''
      const fromMe = msg.key.fromMe
      const msgId = msg.key.id || ''
      console.log(`[WhatsApp] msg: id=${msgId}, fromMe=${fromMe}, jid=${remoteJid}, myId=${myId}, myLid=${myLid}`)

      if (!msg.message) continue

      // Deduplicate: Baileys can fire messages.upsert multiple times for the same message
      if (msgId && !markProcessed(msgId)) {
        console.log(`[WhatsApp] Skipping duplicate message: ${msgId}`)
        continue
      }

      // Self-chat: user sends message to themselves → treat as Sancho command
      // Other chat: only process incoming (fromMe=false), skip outgoing
      const remoteNormalized = remoteJid.replace(/:.*@/, '@')
      const isSelfChat = remoteJid === myLid || remoteNormalized === myId
        || remoteJid.endsWith('@lid')  // LID format = self/linked device
      if (fromMe && !isSelfChat) continue

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      if (!text) continue

      const sender = remoteJid
      // Baileys can only send to @s.whatsapp.net JIDs, not @lid
      const replyJid = isSelfChat ? myId : remoteJid
      console.log(`[WhatsApp] Processing: "${text.substring(0, 100)}" from ${sender} replyTo=${replyJid} (self=${isSelfChat})`)

      // Show user message in Sancho chat UI + start typing indicator
      mainWin?.webContents.send('whatsapp:chat-message', { role: 'user', content: text, source: 'whatsapp' })
      mainWin?.webContents.send('whatsapp:chat-typing', true)

      // Send to Python backend for processing
      try {
        const resp = await fetch(`${BACKEND_URL}/api/whatsapp/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, text, model: getSelectedModel() }),
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.reply) {
            // Stop typing indicator + show LLM response in Sancho chat UI
            mainWin?.webContents.send('whatsapp:chat-typing', false)
            mainWin?.webContents.send('whatsapp:chat-message', { role: 'assistant', content: data.reply, source: 'whatsapp' })
            // Send response back to WhatsApp
            try {
              if (sock) {
                const sentMsg = await sock.sendMessage(replyJid, { text: data.reply })
                // Store for encryption retry handling
                if (sentMsg?.key?.id) {
                  storeMessage(sentMsg.key.id, sentMsg.message)
                }
                console.log(`[WhatsApp] Reply sent to ${replyJid} (msgId=${sentMsg?.key?.id})`)
              } else {
                console.error('[WhatsApp] Cannot send reply: sock is null')
              }
            } catch (sendErr) {
              console.error('[WhatsApp] Failed to send reply:', sendErr)
            }
          }
        } else {
          console.error('[WhatsApp] Backend error:', resp.status)
          mainWin?.webContents.send('whatsapp:chat-typing', false)
        }
      } catch (err) {
        console.error('[WhatsApp] Failed to process message:', err)
        mainWin?.webContents.send('whatsapp:chat-typing', false)
      }
    }
  })
  } catch (err) {
    console.error('[WhatsApp] Failed to create socket:', err)
    sock = null
    setStatus('disconnected', `Connection failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  intentionalDisconnect = true
  if (sock) {
    sock.end(undefined)  // Close connection without logging out (session preserved)
    sock = null
  }
  reconnectAttempts = 0
  setStatus('disconnected')
}

export function getWhatsAppStatus(): WAStatus {
  return status
}

export async function sendWhatsAppMessage(text: string): Promise<boolean> {
  if (!sock || status !== 'connected') return false
  try {
    const myId = sock.user?.id?.replace(/:.*@/, '@')
    if (!myId) return false
    await sock.sendMessage(myId, { text })
    console.log('[WhatsApp] Scheduler notification sent to self')
    return true
  } catch (err) {
    console.error('[WhatsApp] Failed to send scheduler notification:', err)
    return false
  }
}
