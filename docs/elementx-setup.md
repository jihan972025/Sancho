# Element X (Matrix) Setup Guide

## Basic Setup

1. Go to Settings > Chat App > Matrix / Element > Check "Enabled"
2. Homeserver URL: `https://matrix.org` (or your own server)
3. User ID: `@yourname:matrix.org`
4. Password: Your Element X account password
5. Click Save Settings > Connect
6. When another user sends a Matrix DM, Sancho will respond with an LLM reply
7. Matrix messages appear as purple bubbles in the chat window

## Signed Up with Gmail SSO

If you signed up via Gmail SSO, there is no password. You can use an Access Token instead.

### How to Get an Access Token

1. Visit https://app.element.io on your PC browser
2. Sign in with the same Gmail account using "Sign in with Google"
3. After logging in, click the profile icon (top left) > "All settings"
4. Click the "Help & About" tab
5. Expand the "Advanced" section at the bottom
6. Copy the value next to "Access Token" (a long string starting with `syt_`)

### Sancho Settings

- Homeserver URL: `https://matrix.org`
- User ID: `@yourname:matrix.org` (check your Element X profile)
- Password: Leave empty
- Access Token: Paste the token copied above
- Save Settings > Connect

## Creating a Room

In the Element X app, create a room with no invitees and encryption disabled.
