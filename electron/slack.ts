/**
 * Slack connection via @slack/bolt (Socket Mode).
 * Bot token (xoxb-...) + App-level token (xapp-...) for Socket Mode.
 * No QR code — token-based auth only (same pattern as Matrix).
 */

import { BrowserWindow } from 'electron'
import { getSelectedModel } from './selectedModel'

type SlackStatus = 'disconnected' | 'connecting' | 'connected'

let app: any = null  // Bolt App instance
let mainWin: BrowserWindow | null = null
let status: SlackStatus = 'disconnected'
let intentionalDisconnect = false
let botUserId = ''  // Bot's own user ID — to ignore self-messages

const BACKEND_URL = 'http://127.0.0.1:8765'

// ── Status ──

function setStatus(s: SlackStatus): void {
  status = s
  mainWin?.webContents.send('slack:status-update', s)
}

// ── Public API ──

export function initSlack(win: BrowserWindow): void {
  mainWin = win
}

export async function connectSlack(botToken: string, appToken: string): Promise<void> {
  if (app) return

  if (!botToken || !appToken) {
    console.error('[Slack] Bot Token and App Token are required')
    return
  }

  intentionalDisconnect = false
  setStatus('connecting')

  try {
    const { App } = await import('@slack/bolt')

    app = new App({
      token: botToken,
      appToken: appToken,
      socketMode: true,
      logLevel: 'warn' as any,
    })

    // Get bot's own user ID to filter self-messages
    try {
      const authResult = await app.client.auth.test({ token: botToken })
      botUserId = authResult.user_id || ''
      console.log(`[Slack] Authenticated as bot: ${authResult.user} (ID: ${botUserId})`)
    } catch (authErr) {
      console.error('[Slack] auth.test failed:', authErr)
    }

    // Listen for all message events
    app.message(async ({ message, say }: any) => {
      if (intentionalDisconnect) return

      // Skip bot's own messages, edited messages, and system messages
      if (message.subtype) return
      if (message.bot_id) return
      if (message.user === botUserId) return

      const text = message.text || ''
      if (!text) return

      const channelId = message.channel || ''
      const userId = message.user || ''
      const sender = `slack_${userId}_${channelId}`
      console.log(`[Slack] Message: "${text.substring(0, 100)}" from ${userId} in ${channelId}`)

      // Show in Sancho chat UI
      mainWin?.webContents.send('slack:chat-message', {
        role: 'user', content: text, source: 'slack',
      })
      mainWin?.webContents.send('slack:chat-typing', true)

      try {
        const resp = await fetch(`${BACKEND_URL}/api/slack/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, text, model: getSelectedModel() }),
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.reply) {
            mainWin?.webContents.send('slack:chat-typing', false)
            mainWin?.webContents.send('slack:chat-message', {
              role: 'assistant', content: data.reply, source: 'slack',
            })

            // Send reply back to Slack channel (thread-aware)
            try {
              await say({ text: data.reply, thread_ts: message.thread_ts })
              console.log(`[Slack] Reply sent to ${channelId}`)
            } catch (sendErr) {
              console.error('[Slack] Failed to send reply:', sendErr)
            }
          }
        } else {
          console.error('[Slack] Backend error:', resp.status)
          mainWin?.webContents.send('slack:chat-typing', false)
        }
      } catch (err) {
        console.error('[Slack] Failed to process message:', err)
        mainWin?.webContents.send('slack:chat-typing', false)
      }
    })

    // Start the Socket Mode connection
    await app.start()
    setStatus('connected')
    console.log('[Slack] Connected via Socket Mode')
  } catch (err) {
    console.error('[Slack] Connection error:', err)
    app = null
    setStatus('disconnected')
  }
}

export async function disconnectSlack(): Promise<void> {
  intentionalDisconnect = true
  if (app) {
    try {
      await app.stop()
    } catch { /* ignore */ }
    app = null
  }
  setStatus('disconnected')
}

export function getSlackStatus(): SlackStatus {
  return status
}

/**
 * Send a scheduler notification to the bot's first DM channel.
 */
export async function sendSlackMessage(text: string): Promise<boolean> {
  if (!app || status !== 'connected') return false
  try {
    // Find the first IM (DM) channel to send scheduler notifications
    const result = await app.client.conversations.list({
      types: 'im',
      limit: 1,
    })
    const dm = result.channels?.[0]
    if (!dm) {
      console.warn('[Slack] No DM channel found for scheduler notification')
      return false
    }
    await app.client.chat.postMessage({
      channel: dm.id,
      text,
    })
    console.log(`[Slack] Scheduler notification sent to DM ${dm.id}`)
    return true
  } catch (err) {
    console.error('[Slack] Failed to send scheduler notification:', err)
    return false
  }
}
