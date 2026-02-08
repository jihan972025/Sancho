/**
 * Telegram connection via GramJS.
 * QR code login → message handling → LLM processing → reply.
 */

import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSelectedModel } from './selectedModel'

type TGStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

let client: any = null
let mainWin: BrowserWindow | null = null
let status: TGStatus = 'disconnected'
let intentionalDisconnect = false

const BACKEND_URL = 'http://127.0.0.1:8765'

// ── Session persistence ──

function getSessionDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return path.join(home, '.sancho', 'telegram-session')
}

function getSessionFile(): string {
  return path.join(getSessionDir(), 'session.txt')
}

function loadSession(): string {
  try {
    return fs.readFileSync(getSessionFile(), 'utf-8').trim()
  } catch {
    return ''
  }
}

function saveSession(session: string): void {
  const dir = getSessionDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(getSessionFile(), session, 'utf-8')
}

function clearSession(): void {
  try {
    fs.unlinkSync(getSessionFile())
    console.log('[Telegram] Session cleared')
  } catch { /* ignore */ }
}

// ── Status ──

function setStatus(s: TGStatus): void {
  status = s
  mainWin?.webContents.send('telegram:status-update', s)
}

// ── Public API ──

export function initTelegram(win: BrowserWindow): void {
  mainWin = win
}

export async function connectTelegram(apiId: string, apiHash: string): Promise<void> {
  if (client) return

  const numericApiId = parseInt(apiId, 10)
  if (!numericApiId || !apiHash) {
    console.error('[Telegram] api_id and api_hash are required')
    return
  }

  intentionalDisconnect = false
  setStatus('connecting')

  try {
    const { TelegramClient } = await import('telegram')
    const { StringSession } = await import('telegram/sessions')
    const { NewMessage } = await import('telegram/events')
    const QRCode = await import('qrcode')

    const session = new StringSession(loadSession())
    client = new TelegramClient(session, numericApiId, apiHash, {
      connectionRetries: 5,
      deviceModel: 'Sancho',
      appVersion: '1.0',
    })

    await client.connect()

    if (!(await client.isUserAuthorized())) {
      // QR code login
      console.log('[Telegram] Not authorized, starting QR login...')
      await client.signInUserWithQrCode(
        { apiId: numericApiId, apiHash },
        {
          qrCode: async (qr: any) => {
            const token = qr.token.toString('base64url')
            const url = `tg://login?token=${token}`
            const dataUrl = await QRCode.toDataURL(url, { width: 256 })
            setStatus('qr')
            mainWin?.webContents.send('telegram:qr', dataUrl)
            console.log('[Telegram] QR code generated')
          },
          password: async (hint: string) => {
            // 2FA not supported yet via UI — user should disable 2FA or use phone login
            console.error('[Telegram] 2FA password required (hint:', hint, '). Not supported via QR.')
            throw new Error('2FA password required. Please disable 2FA or enter password.')
          },
          onError: async (err: Error) => {
            console.error('[Telegram] Login error:', err.message)
            return true // retry
          },
        }
      )
    }

    // Save session
    const savedSession = client.session.save() as unknown as string
    saveSession(savedSession)
    setStatus('connected')
    console.log('[Telegram] Connected')

    // Get own user ID for self-chat detection
    const me = await client.getMe()
    const myId = me.id.toString()
    console.log(`[Telegram] Logged in as: ${me.firstName || ''} ${me.lastName || ''} (ID: ${myId})`)

    // Handle incoming messages
    client.addEventHandler(async (event: any) => {
      if (intentionalDisconnect) return

      const msg = event.message
      if (!msg || !msg.text) return

      const chatId = msg.chatId?.toString() || ''
      const senderId = msg.senderId?.toString() || ''
      const isSelfChat = chatId === myId
      const isOutgoing = msg.out

      // Only process: incoming from others, or any message in Saved Messages (self-chat)
      if (isOutgoing && !isSelfChat) return

      const text = msg.text
      const sender = `tg_${chatId}`
      console.log(`[Telegram] Message: "${text.substring(0, 100)}" chat=${chatId} sender=${senderId} self=${isSelfChat}`)

      // Show in Sancho chat UI
      mainWin?.webContents.send('telegram:chat-message', { role: 'user', content: text, source: 'telegram' })
      mainWin?.webContents.send('telegram:chat-typing', true)

      try {
        const resp = await fetch(`${BACKEND_URL}/api/telegram/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, text, model: getSelectedModel() }),
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.reply) {
            mainWin?.webContents.send('telegram:chat-typing', false)
            mainWin?.webContents.send('telegram:chat-message', { role: 'assistant', content: data.reply, source: 'telegram' })

            // Send reply back to Telegram
            try {
              if (client?.connected) {
                await client.sendMessage(isSelfChat ? 'me' : msg.chatId, { message: data.reply })
                console.log(`[Telegram] Reply sent to ${chatId}`)
              }
            } catch (sendErr) {
              console.error('[Telegram] Failed to send reply:', sendErr)
            }
          }
        } else {
          console.error('[Telegram] Backend error:', resp.status)
          mainWin?.webContents.send('telegram:chat-typing', false)
        }
      } catch (err) {
        console.error('[Telegram] Failed to process message:', err)
        mainWin?.webContents.send('telegram:chat-typing', false)
      }
    }, new NewMessage({}))

    // Handle disconnection
    client.addEventHandler((update: any) => {
      if (update.className === 'UpdateLoginToken') return
    })

  } catch (err) {
    console.error('[Telegram] Connection error:', err)
    client = null
    setStatus('disconnected')
  }
}

export async function disconnectTelegram(): Promise<void> {
  intentionalDisconnect = true
  if (client) {
    try {
      await client.disconnect()
    } catch { /* ignore */ }
    client = null
  }
  setStatus('disconnected')
}

export function getTelegramStatus(): TGStatus {
  return status
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!client?.connected || status !== 'connected') return false
  try {
    await client.sendMessage('me', { message: text })
    console.log('[Telegram] Scheduler notification sent to Saved Messages')
    return true
  } catch (err) {
    console.error('[Telegram] Failed to send scheduler notification:', err)
    return false
  }
}
