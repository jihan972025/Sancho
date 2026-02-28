/**
 * Discord connection via discord.js (Bot token).
 * No QR code — token-based auth only (same pattern as Slack).
 */

import { BrowserWindow } from 'electron'
import { getSelectedModel } from './selectedModel'

type DiscordStatus = 'disconnected' | 'connecting' | 'connected'

let client: any = null  // Discord.js Client instance
let mainWin: BrowserWindow | null = null
let status: DiscordStatus = 'disconnected'
let intentionalDisconnect = false

const BACKEND_URL = 'http://127.0.0.1:8765'

// ── Status ──

function setStatus(s: DiscordStatus): void {
  status = s
  mainWin?.webContents.send('discord:status-update', s)
}

// ── Public API ──

export function initDiscord(win: BrowserWindow): void {
  mainWin = win
}

export async function connectDiscord(botToken: string): Promise<void> {
  if (client) return

  if (!botToken) {
    console.error('[Discord] Bot Token is required')
    return
  }

  intentionalDisconnect = false
  setStatus('connecting')

  try {
    const { Client, GatewayIntentBits } = await import('discord.js')

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    })

    client.once('ready', () => {
      console.log(`[Discord] Logged in as ${client.user?.tag}`)
      setStatus('connected')
    })

    client.on('messageCreate', async (message: any) => {
      if (intentionalDisconnect) return

      // Skip bot's own messages and other bots
      if (message.author.bot) return

      const text = message.content || ''
      if (!text) return

      // Only respond to DMs or mentions in guild channels
      const isDM = !message.guild
      const isMentioned = message.mentions?.has(client.user)
      if (!isDM && !isMentioned) return

      // Strip bot mention from text
      const cleanText = isDM ? text : text.replace(/<@!?\d+>/g, '').trim()
      if (!cleanText) return

      const sender = `discord_${message.author.id}_${message.channel.id}`
      console.log(`[Discord] Message: "${cleanText.substring(0, 100)}" from ${message.author.tag} in ${message.channel.id}`)

      // Show in Sancho chat UI
      mainWin?.webContents.send('discord:chat-message', {
        role: 'user', content: cleanText, source: 'discord',
      })
      mainWin?.webContents.send('discord:chat-typing', true)

      try {
        const resp = await fetch(`${BACKEND_URL}/api/discord/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, text: cleanText, model: getSelectedModel() }),
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.reply) {
            mainWin?.webContents.send('discord:chat-typing', false)
            mainWin?.webContents.send('discord:chat-message', {
              role: 'assistant', content: data.reply, source: 'discord',
            })

            // Send reply back to Discord
            try {
              // Discord has a 2000 char limit per message
              const reply = data.reply
              if (reply.length <= 2000) {
                await message.reply(reply)
              } else {
                // Split into chunks
                for (let i = 0; i < reply.length; i += 2000) {
                  const chunk = reply.substring(i, i + 2000)
                  if (i === 0) {
                    await message.reply(chunk)
                  } else {
                    await message.channel.send(chunk)
                  }
                }
              }
              console.log(`[Discord] Reply sent to ${message.channel.id}`)
            } catch (sendErr) {
              console.error('[Discord] Failed to send reply:', sendErr)
            }
          }
        } else {
          console.error('[Discord] Backend error:', resp.status)
          mainWin?.webContents.send('discord:chat-typing', false)
        }
      } catch (err) {
        console.error('[Discord] Failed to process message:', err)
        mainWin?.webContents.send('discord:chat-typing', false)
      }
    })

    await client.login(botToken)
  } catch (err) {
    console.error('[Discord] Connection error:', err)
    client = null
    setStatus('disconnected')
  }
}

export async function disconnectDiscord(): Promise<void> {
  intentionalDisconnect = true
  if (client) {
    try {
      await client.destroy()
    } catch { /* ignore */ }
    client = null
  }
  setStatus('disconnected')
}

export function getDiscordStatus(): DiscordStatus {
  return status
}

/**
 * Send a scheduler notification to the bot owner's DM.
 */
export async function sendDiscordMessage(text: string): Promise<boolean> {
  if (!client || status !== 'connected') return false
  try {
    // Get the bot's application owner for DM notifications
    const application = await client.application?.fetch()
    const ownerId = application?.owner?.id
    if (!ownerId) {
      console.warn('[Discord] Could not find bot owner for DM notification')
      return false
    }
    const owner = await client.users.fetch(ownerId)
    const dm = await owner.createDM()

    // Discord has a 2000 char limit
    if (text.length <= 2000) {
      await dm.send(text)
    } else {
      for (let i = 0; i < text.length; i += 2000) {
        await dm.send(text.substring(i, i + 2000))
      }
    }
    console.log(`[Discord] Scheduler notification sent to owner DM`)
    return true
  } catch (err) {
    console.error('[Discord] Failed to send scheduler notification:', err)
    return false
  }
}
