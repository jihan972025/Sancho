# Google Sheets Setup Guide

Connect Google Sheets to Sancho so the AI can read and write spreadsheet data.

> **Note:** Google Sheets API uses OAuth 2.0 authentication. You need a Google account and a Google Cloud project (free tier is sufficient).

---

## Step 1: Create a Google Cloud Project

> If you already created a project for Gmail or Google Calendar, you can reuse the same project — skip to Step 2.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click **Select a project** (top-left) > **New Project**
4. Project name: `Sancho` (or any name)
5. Click **Create**
6. Make sure the new project is selected in the top-left dropdown

## Step 2: Enable Google Sheets API

1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search for **Google Sheets API**
3. Click **Google Sheets API** in the results
4. Click **Enable**

## Step 3: Configure OAuth Consent Screen

> If you already configured the consent screen for Gmail or Calendar, skip to Step 3.5 to add the Sheets scope.

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** > Click **Create**
3. Fill in the required fields:
   - App name: `Sancho`
   - User support email: Your email
   - Developer contact email: Your email
4. Click **Save and Continue**
5. **Scopes** — Click **Add or Remove Scopes**, then add:
   - `https://www.googleapis.com/auth/spreadsheets.readonly` (Read spreadsheets)
   - `https://www.googleapis.com/auth/spreadsheets` (Read and write — optional)
   - `https://www.googleapis.com/auth/drive.readonly` (List spreadsheet files — optional)
6. Click **Update** > **Save and Continue**
7. **Test users** — Click **Add Users**, enter your Gmail address, click **Add**
8. Click **Save and Continue** > **Back to Dashboard**

## Step 4: Create OAuth 2.0 Credentials

> If you already created OAuth credentials for Gmail or Calendar, you can reuse the same Client ID and Client Secret.

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Sancho Desktop` (or any name)
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

## Step 5: Enter Credentials in Sancho

1. Open Sancho > **Settings** > **API** tab
2. Scroll down to the **API Key Required** section
3. Click the **Google Sheets** icon
4. Enter:
   - **Client ID**: Paste the Client ID from Step 4
   - **Client Secret**: Paste the Client Secret from Step 4
5. Click **Save Settings**

## Step 6: First-time Authentication

When you first use a Google Sheets skill command, Sancho will:

1. Open your browser to a Google sign-in page
2. Select your Google account
3. Click **Allow** to grant Sancho access to your spreadsheets
4. You will be redirected back — the token is saved automatically
5. Subsequent requests will use the saved token (no re-login needed)

> The refresh token is stored locally at `~/.sancho/google_sheets_token.json`. Delete this file to revoke access and re-authenticate.

## Finding Your Spreadsheet ID

The spreadsheet ID is the long string in the Google Sheets URL:

```
https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
                                       └──────── spreadsheet_id ────────┘
```

## Usage Examples

Once connected, you can ask Sancho:

- "Read the data from my spreadsheet 1aBcD... range A1:D10"
- "List my Google Sheets spreadsheets"
- "Write these sales numbers to my spreadsheet"

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Make sure the OAuth consent screen is configured (Step 3)
- Ensure your Gmail address is added as a test user

### "Error 403: access_denied"
- Your email must be in the **Test users** list (Step 3.7)
- Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) > **Test users** > Add your email

### "The caller does not have permission" on a specific spreadsheet
- Make sure the spreadsheet is shared with or owned by the authenticated Google account
- The OAuth scope must include `spreadsheets` (not just `spreadsheets.readonly`) for write operations

### Token expired
- Delete `~/.sancho/google_sheets_token.json` and authenticate again
- Tokens auto-refresh, but may expire after 7 days if the app is in "Testing" status

## Sharing a Project with Gmail / Calendar

If you already set up a Google Cloud project for other Google services:

1. Reuse the **same project** — just enable the Sheets API (Step 2)
2. Reuse the **same OAuth credentials** — just add the Sheets scopes (Step 3.5)
3. Enter the same Client ID and Client Secret in the Google Sheets section

## Security Notes

- Credentials are stored locally in `~/.sancho/config.json`
- OAuth tokens are stored locally in `~/.sancho/google_sheets_token.json`
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime at [Google Account Permissions](https://myaccount.google.com/permissions)
