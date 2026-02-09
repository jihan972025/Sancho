# Outlook Setup Guide

Connect Microsoft Outlook to Sancho so the AI can search and read your emails.

> **Note:** Outlook uses Microsoft Azure AD OAuth 2.0 authentication. You need a Microsoft account and an Azure AD app registration (free tier is sufficient).

---

## Step 1: Register an App in Azure AD

1. Go to [Azure Portal — App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Sign in with your Microsoft account
3. Click **New registration**
4. Fill in:
   - Name: `Sancho`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: Select **Public client/native (mobile & desktop)**, enter `http://localhost`
5. Click **Register**
6. On the overview page, copy the **Application (client) ID** — you will need this

## Step 2: Create a Client Secret

1. In your app registration, go to **Certificates & secrets** (left sidebar)
2. Click **New client secret**
3. Description: `Sancho` (or any name)
4. Expires: Choose your preferred duration (e.g., 24 months)
5. Click **Add**
6. Copy the **Value** immediately — this is your Client Secret (it will only be shown once)

## Step 3: Configure API Permissions

1. Go to **API permissions** (left sidebar)
2. Click **Add a permission** > **Microsoft Graph**
3. Select **Delegated permissions**
4. Add the following permissions:
   - `Mail.Read` — Read user mail
   - `Mail.Send` — Send mail (optional)
   - `User.Read` — Sign in and read user profile
5. Click **Add permissions**
6. If you see an **Admin consent** button and you are the admin, click **Grant admin consent** (optional for personal accounts)

## Step 4: Enter Credentials in Sancho

1. Open Sancho > **Settings** > **API** tab
2. Scroll down to the **API Key Required** section
3. Click the **Outlook** icon
4. Enter:
   - **Client ID**: The Application (client) ID from Step 1
   - **Client Secret**: The secret value from Step 2
5. Click **Save Settings**

## Step 5: First-time Authentication

When you first use an Outlook skill command, Sancho will:

1. Open your browser to a Microsoft sign-in page
2. Sign in with your Microsoft account
3. Review and accept the permissions
4. You will be redirected back — the token is saved automatically
5. Subsequent requests will use the saved token (no re-login needed)

> The refresh token is stored locally at `~/.sancho/outlook_token.json`. Delete this file to revoke access and re-authenticate.

## Usage Examples

Once connected, you can ask Sancho:

- "Check my unread Outlook emails"
- "Search Outlook for emails from boss@company.com"
- "Find emails about the quarterly report"

## Troubleshooting

### "AADSTS700016: Application not found"
- Verify the Client ID is correct in Sancho Settings
- Make sure the app registration exists in Azure Portal

### "AADSTS7000218: Invalid client secret"
- Client secrets expire — check if yours has expired
- Go to Azure Portal > App registrations > Certificates & secrets > Create a new secret

### "Insufficient privileges"
- Ensure the required API permissions are added (Step 3)
- For organizational accounts, admin consent may be required

### Token expired
- Delete `~/.sancho/outlook_token.json` and authenticate again
- Tokens typically auto-refresh using the refresh token

## Security Notes

- Credentials are stored locally in `~/.sancho/config.json`
- OAuth tokens are stored locally in `~/.sancho/outlook_token.json`
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime at [Microsoft Account App Permissions](https://account.live.com/consent/Manage)
