# Google Calendar Setup Guide

Connect Google Calendar to Sancho so the AI can list, search, and create calendar events.

> **Note:** Google Calendar API uses OAuth 2.0 authentication. You need a Google account and a Google Cloud project (free tier is sufficient).

---

## Step 1: Create a Google Cloud Project

> If you already created a project for Gmail, you can reuse the same project — skip to Step 2.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click **Select a project** (top-left) > **New Project**
4. Project name: `Sancho` (or any name)
5. Click **Create**
6. Make sure the new project is selected in the top-left dropdown

## Step 2: Enable Google Calendar API

1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search for **Google Calendar API**
3. Click **Google Calendar API** in the results
4. Click **Enable**

## Step 3: Configure OAuth Consent Screen

> If you already configured the consent screen for Gmail, skip to Step 3.5 to add the Calendar scope.

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** > Click **Create**
3. Fill in the required fields:
   - App name: `Sancho`
   - User support email: Your email
   - Developer contact email: Your email
4. Click **Save and Continue**
5. **Scopes** — Click **Add or Remove Scopes**, then add:
   - `https://www.googleapis.com/auth/calendar.readonly` (Read calendar events)
   - `https://www.googleapis.com/auth/calendar.events` (Create/edit events — optional)
6. Click **Update** > **Save and Continue**
7. **Test users** — Click **Add Users**, enter your Gmail address, click **Add**
8. Click **Save and Continue** > **Back to Dashboard**

## Step 4: Create OAuth 2.0 Credentials

> If you already created OAuth credentials for Gmail, you can reuse the same Client ID and Client Secret.

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Sancho Desktop` (or any name)
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

## Step 5: Enter Credentials in Sancho

1. Open Sancho > **Settings** > **API** tab
2. Scroll down to the **API Key Required** section
3. Click the **Google Calendar** icon
4. Enter:
   - **Client ID**: Paste the Client ID from Step 4
   - **Client Secret**: Paste the Client Secret from Step 4
5. Click **Save Settings**

## Step 6: First-time Authentication

When you first use a Google Calendar skill command, Sancho will:

1. Open your browser to a Google sign-in page
2. Select your Google account
3. Click **Allow** to grant Sancho access to your calendar
4. You will be redirected back — the token is saved automatically
5. Subsequent requests will use the saved token (no re-login needed)

> The refresh token is stored locally at `~/.sancho/google_calendar_token.json`. Delete this file to revoke access and re-authenticate.

## Usage Examples

Once connected, you can ask Sancho:

- "What's on my calendar today?"
- "Show my meetings for this week"
- "Create a meeting at 3pm tomorrow titled Team Standup"
- "Search my calendar for dentist appointments"

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Make sure the OAuth consent screen is configured (Step 3)
- Ensure your Gmail address is added as a test user

### "Error 403: access_denied"
- Your email must be in the **Test users** list (Step 3.7)
- Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) > **Test users** > Add your email

### "Insufficient Permission"
- Make sure the Calendar scopes are added (Step 3.5)
- Delete `~/.sancho/google_calendar_token.json` and re-authenticate to pick up new scopes

### Token expired
- Delete `~/.sancho/google_calendar_token.json` and authenticate again
- Tokens auto-refresh, but may expire after 7 days if the app is in "Testing" status

## Sharing a Project with Gmail

If you already set up a Google Cloud project for Gmail:

1. You can reuse the **same project** — just enable the Calendar API (Step 2)
2. You can reuse the **same OAuth credentials** — just add the Calendar scopes (Step 3.5)
3. Enter the same Client ID and Client Secret in the Google Calendar section

## Security Notes

- Credentials are stored locally in `~/.sancho/config.json`
- OAuth tokens are stored locally in `~/.sancho/google_calendar_token.json`
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime at [Google Account Permissions](https://myaccount.google.com/permissions)
