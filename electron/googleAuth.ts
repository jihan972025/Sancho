import { BrowserWindow } from 'electron'
import http from 'http'

const BACKEND_URL = 'http://127.0.0.1:8765'
const GOOGLE_CLIENT_ID = '324405890477-dkcl4mncv9q1o2kvkmlg8ob4mcpvadil.apps.googleusercontent.com'
const GOOGLE_CLIENT_SECRET = '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'
const REDIRECT_URI = 'http://localhost:9876/callback'
const CALLBACK_PORT = 9876

interface GoogleAuthResult {
  email: string
  name: string
  picture_url: string
}

export function startGoogleOAuth(): Promise<GoogleAuthResult | null> {
  return new Promise((resolve) => {
    let resolved = false
    let callbackServer: http.Server | null = null
    let authWindow: BrowserWindow | null = null

    let codeReceived = false

    const cleanup = () => {
      if (callbackServer) {
        try { callbackServer.close() } catch {}
        callbackServer = null
      }
      if (authWindow && !authWindow.isDestroyed()) {
        try { authWindow.close() } catch {}
        authWindow = null
      }
    }

    const finish = (result: GoogleAuthResult | null) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    // Start a temporary HTTP server on fixed port to capture the OAuth redirect
    callbackServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${CALLBACK_PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      // Send a simple HTML response to the browser
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px;"><h2>Login successful!</h2><p>You can close this window.</p><script>window.close()</script></body></html>')

      if (error || !code) {
        finish(null)
        return
      }

      codeReceived = true

      // Exchange the code for tokens via backend
      try {
        const postData = JSON.stringify({
          code,
          redirect_uri: REDIRECT_URI,
        })
        const body: string = await new Promise((res2, rej) => {
          const backendReq = http.request(`${BACKEND_URL}/api/auth/google/exchange`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            },
          }, (resp) => {
            let data = ''
            resp.on('data', (chunk: Buffer) => { data += chunk.toString() })
            resp.on('end', () => res2(data))
            resp.on('error', rej)
          })
          backendReq.on('error', rej)
          backendReq.write(postData)
          backendReq.end()
        })
        finish(JSON.parse(body))
      } catch (err) {
        console.error('Google OAuth exchange failed:', err)
        finish(null)
      }
    })

    callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => {
      // Open the Google OAuth consent page in a popup window
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/spreadsheets',
      ].join(' '))
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      authWindow.loadURL(authUrl.toString())

      authWindow.on('closed', () => {
        authWindow = null
        // Only resolve null if we haven't received the auth code yet
        // (user closed the window manually without completing login)
        if (!codeReceived) {
          finish(null)
        }
      })
    })

    callbackServer.on('error', () => {
      finish(null)
    })
  })
}
