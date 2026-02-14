# Gmail Setup Guide

Connect Gmail to Sancho so the AI can search, read, and send emails.

> **Note:** Gmail uses Sancho's built-in Google OAuth. No Google Cloud project or API keys are needed.

---

## Step 1: Sign in with Google

1. Open Sancho > **Settings** > **Profile** tab
2. Click the **Sign in with Google** button
3. A Google sign-in window will open
4. Select your Google account
5. Click **Allow** to grant Sancho access
6. The window closes automatically — you're now logged in

> One sign-in gives access to Gmail, Google Calendar, and Google Sheets.

## Step 2: Start Using Gmail

Once signed in, you can ask Sancho:

- "Check my unread emails"
- "Search emails from john@company.com"
- "Find emails about the project report from last week"
- "Send an email to alice@example.com about tomorrow's meeting"

## Signing Out

1. Open Sancho > **Settings** > **Profile** tab
2. Click **Sign out** next to your Google account info

## Troubleshooting

### "Access blocked" or consent screen warning
- This may appear because the app is pending Google verification
- Click **Advanced** > **Go to Sancho (unsafe)** to proceed
- This is safe — Sancho runs locally and never sends your data to third-party servers

### Gmail skill not responding
- Make sure you are signed in: check **Settings** > **Profile** for your Google account
- Try signing out and signing back in

### Token expired
- Sign out and sign in again from **Settings** > **Profile**
- Tokens auto-refresh, but may occasionally expire

## Security Notes

- OAuth tokens are stored locally in `~/.sancho/config.json`
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime at [Google Account Permissions](https://myaccount.google.com/permissions)
