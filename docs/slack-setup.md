# Slack Setup Guide

Connect Slack to Sancho so the AI can receive and respond to your direct messages via a Slack bot.

> **Note:** Slack uses Socket Mode with a Bot Token (`xoxb-...`) and an App-Level Token (`xapp-...`). No QR code is needed — it's purely token-based. A free Slack workspace is sufficient.

---

## Step 1: Create a Slack App

1. Go to [Slack API — Your Apps](https://api.slack.com/apps)
2. Sign in with your Slack account
3. Click **Create New App**
4. Select **From scratch**
5. Fill in:
   - App Name: `Sancho` (or any name you like)
   - Pick a workspace: Select the workspace you want to connect
6. Click **Create App**

## Step 2: Enable Socket Mode (App-Level Token)

1. In your app settings, go to **Socket Mode** (left sidebar)
2. Toggle **Enable Socket Mode** to ON
3. A dialog will appear to create an App-Level Token:
   - Token Name: `sancho` (or any name)
   - Click **Generate**
4. Copy the token starting with `xapp-...` — this is your **App-Level Token**
5. Click **Done**

## Step 3: Configure Bot Token Scopes

1. Go to **OAuth & Permissions** (left sidebar)
2. Scroll down to **Scopes** > **Bot Token Scopes**
3. Click **Add an OAuth Scope** and add the following:
   - `chat:write` — Send messages as the bot
   - `im:history` — Read direct message history
   - `im:read` — View basic DM info
   - `im:write` — Start direct messages with people
   - `channels:history` — (optional) Read messages in public channels
   - `users:read` — View basic user info
4. Scroll back up and click **Install to Workspace**
5. Click **Allow** on the authorization screen
6. Copy the **Bot User OAuth Token** starting with `xoxb-...` — this is your **Bot Token**

## Step 4: Enable Events (required for receiving messages)

1. Go to **Event Subscriptions** (left sidebar)
2. Toggle **Enable Events** to ON
3. Under **Subscribe to bot events**, click **Add Bot User Event** and add:
   - `message.im` — Receive direct messages sent to the bot
   - `message.channels` — (optional) Receive messages in public channels
4. Click **Save Changes**

## Step 5: Enter Tokens in Sancho

1. Open Sancho > **Settings** > **Chat App** tab
2. Click the **Slack icon** on the left sidebar
3. Check **Enabled**
4. Enter:
   - **Bot Token**: The `xoxb-...` token from Step 3
   - **App-Level Token**: The `xapp-...` token from Step 2
5. Click **Connect**
6. The status will change to **Connected**

## Step 6: Usage

1. Open Slack and find the **Sancho** bot in your Direct Messages
   - If you don't see it, click the **+** next to Direct Messages > Search for `Sancho`
2. Send a message to the bot — Sancho will process it through the AI and reply
3. Slack messages also appear in the Sancho chat window

### Usage Examples

Once connected, you can message the Sancho bot in Slack:

- "Summarize the latest news about AI"
- "What's the weather in Seoul?"
- "Search my Gmail for emails from marketing"
- "Check my Google Calendar for today"
- "Analyze BTC/KRW chart"

## Troubleshooting

### Bot doesn't respond to messages
- Make sure **Socket Mode** is enabled (Step 2)
- Verify **Event Subscriptions** are enabled with `message.im` event (Step 4)
- Check that the bot is **Connected** in Sancho Settings (green status indicator)

### "Invalid auth" or connection fails
- Verify the Bot Token starts with `xoxb-` and the App Token starts with `xapp-`
- Make sure you haven't accidentally swapped the two tokens
- Tokens may have been revoked — regenerate them from api.slack.com/apps

### Bot appears offline in Slack
- Sancho must be running for the bot to be active (Socket Mode requires a live connection)
- Go to Settings > Chat App > Slack and click **Connect** again

### "missing_scope" error
- Go to api.slack.com/apps > Your App > OAuth & Permissions
- Add the missing scope listed in the error message
- Reinstall the app to your workspace after adding new scopes

## Security Notes

- Tokens are stored locally in `~/.sancho/config.json` (encrypted at rest)
- Sancho never sends your tokens to any third-party server
- Socket Mode means no public URL is needed — all communication goes through Slack's WebSocket
- You can revoke access anytime:
  - In Sancho: Settings > Chat App > Slack > Disconnect
  - Online: [Slack App Management](https://api.slack.com/apps) > Your App > Revoke Tokens
