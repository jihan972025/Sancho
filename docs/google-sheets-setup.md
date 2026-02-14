# Google Sheets Setup Guide

Connect Google Sheets to Sancho so the AI can read and write spreadsheet data.

> **Note:** Google Sheets uses Sancho's built-in Google OAuth. No Google Cloud project or API keys are needed.

---

## Step 1: Sign in with Google

1. Open Sancho > **Settings** > **Profile** tab
2. Click the **Sign in with Google** button
3. A Google sign-in window will open
4. Select your Google account
5. Click **Allow** to grant Sancho access
6. The window closes automatically — you're now logged in

> One sign-in gives access to Gmail, Google Calendar, and Google Sheets.

## Step 2: Finding Your Spreadsheet ID

The spreadsheet ID is the long string in the Google Sheets URL:

```
https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
                                       └──────── spreadsheet_id ────────┘
```

## Step 3: Start Using Google Sheets

Once signed in, you can ask Sancho:

- "Read the data from my spreadsheet 1aBcD... range A1:D10"
- "List my Google Sheets spreadsheets"
- "Write these sales numbers to my spreadsheet"

## Signing Out

1. Open Sancho > **Settings** > **Profile** tab
2. Click **Sign out** next to your Google account info

## Troubleshooting

### "Access blocked" or consent screen warning
- This may appear because the app is pending Google verification
- Click **Advanced** > **Go to Sancho (unsafe)** to proceed
- This is safe — Sancho runs locally and never sends your data to third-party servers

### Sheets skill not responding
- Make sure you are signed in: check **Settings** > **Profile** for your Google account
- Try signing out and signing back in

### "The caller does not have permission" on a specific spreadsheet
- Make sure the spreadsheet is shared with or owned by the authenticated Google account

### Token expired
- Sign out and sign in again from **Settings** > **Profile**
- Tokens auto-refresh, but may occasionally expire

## Security Notes

- OAuth tokens are stored locally in `~/.sancho/config.json`
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime at [Google Account Permissions](https://myaccount.google.com/permissions)
