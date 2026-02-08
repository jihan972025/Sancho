/**
 * Matrix (Element) connection via matrix-js-sdk.
 * Login with user/password → listen for DM messages → LLM processing → reply.
 */

import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSelectedModel } from './selectedModel'

type MXStatus = 'disconnected' | 'connecting' | 'connected'

let client: any = null
let mainWin: BrowserWindow | null = null
let status: MXStatus = 'disconnected'
let intentionalDisconnect = false
let myUserId = ''
let myDeviceId = ''

const BACKEND_URL = 'http://127.0.0.1:8765'

// ── Access token persistence ──

function getTokenFile(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const dir = path.join(home, '.sancho', 'matrix-session')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'token.json')
}

function loadToken(): { accessToken: string; userId: string; deviceId: string } | null {
  try {
    return JSON.parse(fs.readFileSync(getTokenFile(), 'utf-8'))
  } catch {
    return null
  }
}

function saveToken(data: { accessToken: string; userId: string; deviceId: string }): void {
  fs.writeFileSync(getTokenFile(), JSON.stringify(data), 'utf-8')
}

function clearToken(): void {
  try { fs.unlinkSync(getTokenFile()) } catch { /* ignore */ }
}

// ── Status ──

function setStatus(s: MXStatus): void {
  status = s
  mainWin?.webContents.send('matrix:status-update', s)
}

// ── Public API ──

export function initMatrix(win: BrowserWindow): void {
  mainWin = win
}

export async function connectMatrix(
  homeserverUrl: string,
  userId: string,
  password: string,
  accessToken: string,
): Promise<void> {
  if (client) return

  intentionalDisconnect = false
  setStatus('connecting')

  try {
    // matrix-js-sdk is ESM-only; prevent TypeScript from converting to require()
    const importDynamic = new Function('modulePath', 'return import(modulePath)')
    const sdk = await importDynamic('matrix-js-sdk')

    // Try saved token first, then provided access_token, then password login
    const saved = loadToken()
    let token = ''
    let deviceId = ''

    if (saved?.accessToken && saved.userId === userId) {
      // Reuse saved session
      token = saved.accessToken
      deviceId = saved.deviceId
      console.log('[Matrix] Using saved access token')
    } else if (accessToken) {
      token = accessToken
      console.log('[Matrix] Using provided access token')
    } else if (userId && password) {
      // Login with password to get access token
      console.log('[Matrix] Logging in with password...')
      const tempClient = sdk.createClient({ baseUrl: homeserverUrl })
      const loginResp = await tempClient.login('m.login.password', {
        user: userId,
        password,
      })
      token = loginResp.access_token
      deviceId = loginResp.device_id
      myUserId = loginResp.user_id
      saveToken({ accessToken: token, userId: myUserId, deviceId })
      console.log(`[Matrix] Login successful: ${myUserId}`)
      tempClient.stopClient()
    } else {
      console.error('[Matrix] No credentials provided')
      setStatus('disconnected')
      return
    }

    // Create persistent client
    client = sdk.createClient({
      baseUrl: homeserverUrl,
      accessToken: token,
      userId: userId || myUserId,
      deviceId: deviceId || undefined,
    })

    myUserId = userId || myUserId
    myDeviceId = deviceId || client.getDeviceId() || ''

    // Start sync
    await client.startClient({ initialSyncLimit: 0 })

    // Wait for sync
    await new Promise<void>((resolve) => {
      client.once('sync' as any, (state: string) => {
        if (state === 'PREPARED' || state === 'SYNCING') {
          resolve()
        }
      })
    })

    setStatus('connected')
    console.log('[Matrix] Connected and syncing')

    // Listen for new messages
    client.on('Room.timeline' as any, async (event: any, room: any, toStartOfTimeline: boolean) => {
      if (intentionalDisconnect) return
      if (toStartOfTimeline) return // skip historical messages

      // Skip local echoes (messages sent by THIS client instance)
      if (event.status != null) return

      // Only handle text messages
      if (event.getType() !== 'm.room.message') return
      const content = event.getContent()
      if (content.msgtype !== 'm.text') return

      const senderId = event.getSender()

      // Skip messages sent from our own device (bot replies synced back)
      const unsigned = event.getUnsigned?.() || {}
      if (senderId === myUserId && unsigned.device_id === myDeviceId) return

      const text = content.body || ''
      if (!text) return

      const roomId = room.roomId
      const sender = `mx_${senderId}`
      console.log(`[Matrix] Message: "${text.substring(0, 100)}" from ${senderId} in ${roomId}`)

      // Show in Sancho chat UI
      mainWin?.webContents.send('matrix:chat-message', { role: 'user', content: text, source: 'matrix' })
      mainWin?.webContents.send('matrix:chat-typing', true)

      try {
        const resp = await fetch(`${BACKEND_URL}/api/matrix/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, text, model: getSelectedModel() }),
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.reply) {
            mainWin?.webContents.send('matrix:chat-typing', false)
            mainWin?.webContents.send('matrix:chat-message', { role: 'assistant', content: data.reply, source: 'matrix' })

            // Send reply to Matrix room
            try {
              if (client) {
                await client.sendTextMessage(roomId, data.reply)
                console.log(`[Matrix] Reply sent to ${roomId}`)
              }
            } catch (sendErr) {
              console.error('[Matrix] Failed to send reply:', sendErr)
            }
          }
        } else {
          console.error('[Matrix] Backend error:', resp.status)
          mainWin?.webContents.send('matrix:chat-typing', false)
        }
      } catch (err) {
        console.error('[Matrix] Failed to process message:', err)
        mainWin?.webContents.send('matrix:chat-typing', false)
      }
    })

  } catch (err) {
    console.error('[Matrix] Connection error:', err)
    client = null
    setStatus('disconnected')
  }
}

export async function disconnectMatrix(): Promise<void> {
  intentionalDisconnect = true
  if (client) {
    try {
      client.stopClient()
    } catch { /* ignore */ }
    client = null
  }
  setStatus('disconnected')
}

export function getMatrixStatus(): MXStatus {
  return status
}

export async function sendMatrixMessage(text: string): Promise<boolean> {
  if (!client || status !== 'connected') return false
  try {
    // Send to the first joined room
    const rooms = client.getRooms()
    const joined = rooms.find((r: any) => r.getMyMembership() === 'join')
    if (!joined) {
      console.warn('[Matrix] No joined rooms to send notification to')
      return false
    }
    await client.sendTextMessage(joined.roomId, text)
    console.log(`[Matrix] Scheduler notification sent to room ${joined.roomId}`)
    return true
  } catch (err) {
    console.error('[Matrix] Failed to send scheduler notification:', err)
    return false
  }
}
