import { BrowserWindow } from 'electron'
import http from 'http'

const BACKEND_URL = 'http://127.0.0.1:8765'
const REDIRECT_URI = 'http://localhost:9877/callback'
const CALLBACK_PORT = 9877

interface OutlookAuthResult {
  email: string
  name: string
}

export function startOutlookOAuth(clientId: string, clientSecret: string): Promise<OutlookAuthResult | null> {
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

    const finish = (result: OutlookAuthResult | null) => {
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
          client_id: clientId,
          client_secret: clientSecret,
        })
        const body: string = await new Promise((res2, rej) => {
          const backendReq = http.request(`${BACKEND_URL}/api/auth/outlook/exchange`, {
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
        console.error('Outlook OAuth exchange failed:', err)
        finish(null)
      }
    })

    callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => {
      // Open the Microsoft OAuth consent page in a popup window
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', [
        'openid',
        'profile',
        'email',
        'offline_access',
        'Mail.Read',
        'Mail.Send',
        'User.Read',
      ].join(' '))
      authUrl.searchParams.set('response_mode', 'query')
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
