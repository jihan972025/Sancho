# Outlook Setup Guide

Connect Microsoft Outlook to Sancho so the AI can search, read, and send your emails.

> **Note:** Outlook uses Microsoft Azure AD OAuth 2.0 authentication. You need a Microsoft account and an Azure AD app registration (free tier is sufficient).

---

## Step 1: Register an App in Azure AD

1. Go to [Azure Portal — App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Sign in with your Microsoft account
3. Click **New registration**
4. Fill in:
   - Name: `Sancho`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: Select **Web**, enter `http://localhost:9877/callback`
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
   - `Mail.Send` — Send mail
   - `User.Read` — Sign in and read user profile
   - `offline_access` — Maintain access (for token refresh)
5. Click **Add permissions**
6. If you see an **Admin consent** button and you are the admin, click **Grant admin consent** (optional for personal accounts)

## Step 4: Enter Credentials in Sancho

1. Open Sancho > **Settings** > **API** tab
2. Scroll down to the **API Key Required** section
3. Click the **Outlook** card
4. Enter:
   - **Client ID**: The Application (client) ID from Step 1
   - **Client Secret**: The secret value from Step 2
5. Click **Save Settings**

## Step 5: Sign in with Microsoft

1. Go to **Settings** > **Profile** tab
2. You will see a **Microsoft Outlook** section (only visible after Step 4)
3. Click **Sign in with Microsoft**
4. A popup window will open with the Microsoft login page
5. Sign in with your Microsoft account and accept the permissions
6. The popup closes automatically — your name and email will appear in the Profile tab
7. The Outlook skill is now active and ready to use

> Tokens are stored locally in `~/.sancho/config.json` (encrypted at rest). They auto-refresh when expired. To revoke access, click **Logout** in the Profile tab.

## Usage Examples

Once connected, you can ask Sancho:

- "Check my unread Outlook emails"
- "Search Outlook for emails from boss@company.com"
- "Find emails about the quarterly report"
- "Read the latest email"
- "Send an email to colleague@company.com about the meeting tomorrow"

## Troubleshooting

### "AADSTS700016: Application not found"
- Verify the Client ID is correct in Settings > API > Outlook
- Make sure the app registration exists in Azure Portal

### "AADSTS7000218: Invalid client secret"
- Client secrets expire — check if yours has expired
- Go to Azure Portal > App registrations > Certificates & secrets > Create a new secret

### "AADSTS50011: Reply URL does not match"
- Make sure the Redirect URI in Azure is exactly `http://localhost:9877/callback`
- Go to Azure Portal > App registrations > Authentication > Edit the redirect URI

### "Insufficient privileges"
- Ensure the required API permissions are added (Step 3)
- For organizational accounts, admin consent may be required

### Token expired / Login failed
- Go to Settings > Profile > Click **Logout** under Microsoft Outlook
- Click **Sign in with Microsoft** again to re-authenticate
- Tokens normally auto-refresh, but if the refresh token expires you need to re-login

## Security Notes

- Credentials and OAuth tokens are stored locally in `~/.sancho/config.json` (encrypted at rest)
- Sancho never sends your credentials to any third-party server
- You can revoke access anytime:
  - In Sancho: Settings > Profile > Logout
  - Online: [Microsoft Account App Permissions](https://account.live.com/consent/Manage)
