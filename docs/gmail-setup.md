# Gmail Setup Guide

Connect Gmail to Sancho so the AI can search and read your emails.

> **Note:** Gmail API uses OAuth 2.0 authentication. You need a Google account and a Google Cloud project (free tier is sufficient).

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click **Select a project** (top-left) > **New Project**
4. Project name: `Sancho` (or any name)
5. Click **Create**
6. Make sure the new project is selected in the top-left dropdown

## Step 2: Enable Gmail API

1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search for **Gmail API**
3. Click **Gmail API** in the results
4. Click **Enable**

## Step 3: Configure OAuth Consent Screen

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** > Click **Create**
3. Fill in the required fields:
   - App name: `Sancho`
   - User support email: Your email
   - Developer contact email: Your email
4. Click **Save and Continue**
5. **Scopes** — Click **Add or Remove Scopes**, then add:
   - `https://www.googleapis.com/auth/gmail.readonly` (Read emails)
   - `https://www.googleapis.com/auth/gmail.send` (Send emails — optional)
   - `https://www.googleapis.com/auth/gmail.modify` (Mark read/unread — optional)
6. Click **Update** > **Save and Continue**
7. **Test users** — Click **Add Users**, enter your Gmail address, click **Add**
8. Click **Save and Continue** > **Back to Dashboard**

> **Important:** While the app is in "Testing" status, only the test users you added can authenticate. This is fine for personal use.

## Step 4: Create OAuth 2.0 Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Sancho Desktop` (or any name)
5. Click **Create**
6. A dialog will show your credentials:
   - **Client ID**: `xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com`
   - **Client Secret**: `GOCSPX-xxxxxxxxxxxxxxxx`
7. Click **Download JSON** to save a backup (optional)

## Step 5: Enter Credentials in Sancho

1. Open Sancho > **Settings** > **API** tab
2. Scroll down to the **API Key Required** section
3. Click the **Gmail** icon
4. Enter:
   - **Client ID**: Paste the Client ID from Step 4
   - **Client Secret**: Paste the Client Secret from Step 4
5. Click **Save Settings**

## Step 6: First-time Authentication

When you first use a Gmail skill command, Sancho will:

1. Open your browser to a Google sign-in page
2. Select your Google account
3. Click **Allow** to grant Sancho access to your Gmail
4. You will be redirected back — the token is saved automatically
5. Subsequent requests will use the saved token (no re-login needed)

> The refresh token is stored locally at `~/.sancho/gmail_token.json`. Delete this file to revoke access and re-authenticate.

## Usage Examples

Once connected, you can ask Sancho:

- "Check my unread emails"
- "Search emails from john@company.com"
- "Find emails about the project report from last week"

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Make sure the OAuth consent screen is configured (Step 3)
- Ensure your Gmail address is added as a test user

### "Error 403: access_denied"
- Your email must be in the **Test users** list (Step 3.7)
- Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) > **Test users** > Add your email

### "Invalid client" error
- Double-check the Client ID and Client Secret in Sancho Settings
- Make sure there are no extra spaces when pasting

### Token expired
- Delete `~/.sancho/gmail_token.json` and authenticate again
- Tokens auto-refresh, but may expire after 7 days if the app is in "Testing" status

## Publishing the App (Optional)

If you want the token to last longer and remove the "Testing" warning:

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Click **Publish App**
3. For personal use only, Google may require a brief verification

> For personal use, keeping the app in "Testing" status is perfectly fine. Just re-authenticate if the token expires.

## Security Notes

- Credentials are stored locally in `~/.sancho/config.json`
- OAuth tokens are stored locally in `~/.sancho/gmail_token.json`
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime at [Google Account Permissions](https://myaccount.google.com/permissions)
