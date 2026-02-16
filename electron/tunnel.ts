/**
 * Cloudflare Quick Tunnel manager.
 *
 * Spawns `cloudflared tunnel --url http://localhost:8765` to create a public
 * HTTPS URL that proxies traffic to the local FastAPI backend.
 * No Cloudflare account or API key is required (Quick Tunnel mode).
 *
 * If cloudflared is not installed, it is automatically downloaded from
 * GitHub releases on first use (~30 MB).
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { app } from 'electron'

let tunnelProcess: ChildProcess | null = null
let tunnelUrl: string = ''

const isDev = !app.isPackaged

const CLOUDFLARED_DOWNLOAD_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Download a file via HTTPS, following redirects (GitHub → S3).
 */
function downloadFile(url: string, dest: string, maxRedirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'))
    }

    const tmpDest = dest + '.tmp'

    https.get(url, (res) => {
      // Follow redirects (301, 302, 303, 307, 308)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`[Tunnel] Redirect ${res.statusCode} → ${res.headers.location.slice(0, 80)}...`)
        res.resume()
        return downloadFile(res.headers.location, dest, maxRedirects - 1)
          .then(resolve)
          .catch(reject)
      }

      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
      let downloadedBytes = 0
      let lastLogPct = -10

      const file = fs.createWriteStream(tmpDest)

      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length
        if (totalBytes > 0) {
          const pct = Math.round((downloadedBytes / totalBytes) * 100)
          if (pct >= lastLogPct + 10) {
            lastLogPct = pct
            console.log(
              `[Tunnel] Downloading cloudflared... ${pct}% (${Math.round(downloadedBytes / 1024 / 1024)}MB / ${Math.round(totalBytes / 1024 / 1024)}MB)`,
            )
          }
        }
      })

      res.pipe(file)

      file.on('finish', () => {
        file.close(() => {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest)
            fs.renameSync(tmpDest, dest)
            resolve()
          } catch (err) {
            reject(err)
          }
        })
      })

      file.on('error', (err) => {
        try { fs.unlinkSync(tmpDest) } catch { /* ignore */ }
        reject(err)
      })
    }).on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Locate the cloudflared binary.
 * - Production: bundled in extraResources/cloudflared/
 * - Dev: check ~/.sancho/cloudflared.exe
 */
function findCloudflared(): string {
  if (!isDev) {
    const bundled = path.join(process.resourcesPath, 'cloudflared', 'cloudflared.exe')
    if (fs.existsSync(bundled)) return bundled
  }

  const homeDir = process.env.USERPROFILE || process.env.HOME || ''
  const localBin = path.join(homeDir, '.sancho', 'cloudflared.exe')
  if (fs.existsSync(localBin)) return localBin

  // Last resort: assume it's on PATH
  return 'cloudflared'
}

/**
 * Ensure cloudflared binary exists, downloading if necessary.
 */
async function ensureCloudflared(): Promise<void> {
  // Production: check bundled binary
  if (!isDev) {
    const bundled = path.join(process.resourcesPath, 'cloudflared', 'cloudflared.exe')
    if (fs.existsSync(bundled)) return
  }

  // Check ~/.sancho/cloudflared.exe
  const homeDir = process.env.USERPROFILE || process.env.HOME || ''
  const sanchoDir = path.join(homeDir, '.sancho')
  const localBin = path.join(sanchoDir, 'cloudflared.exe')

  if (fs.existsSync(localBin)) return

  // Not found anywhere — download from GitHub
  console.log('[Tunnel] cloudflared not found, downloading from GitHub...')

  if (!fs.existsSync(sanchoDir)) {
    fs.mkdirSync(sanchoDir, { recursive: true })
  }

  await downloadFile(CLOUDFLARED_DOWNLOAD_URL, localBin)
  console.log(`[Tunnel] cloudflared downloaded to ${localBin}`)
}

/**
 * Notify the Python backend of the active tunnel URL.
 */
async function notifyBackend(url: string): Promise<void> {
  try {
    const http = await import('http')
    await new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({ url })
      const req = http.request(
        'http://127.0.0.1:8765/api/voice/tunnel-url',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
          res.on('error', reject)
        },
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })
    console.log(`[Tunnel] Notified backend: ${url || '(cleared)'}`)
  } catch (err) {
    console.error('[Tunnel] Failed to notify backend:', (err as Error).message)
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Start the cloudflared tunnel.
 * Downloads cloudflared automatically if not found.
 * Returns the public HTTPS URL once the tunnel is ready.
 */
export async function startTunnel(): Promise<string> {
  // Already running
  if (tunnelProcess && tunnelUrl) return tunnelUrl

  // Kill any stale process
  if (tunnelProcess) {
    tunnelProcess.kill()
    tunnelProcess = null
    tunnelUrl = ''
  }

  // Ensure binary exists (auto-download if needed)
  await ensureCloudflared()

  const bin = findCloudflared()
  console.log(`[Tunnel] Starting: ${bin} tunnel --url http://localhost:8765`)

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ['tunnel', '--url', 'http://localhost:8765'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    tunnelProcess = proc

    // URL pattern from cloudflared output
    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

    let resolved = false

    // Timeout: if URL not found in 30s, reject
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        reject(new Error('Tunnel startup timed out (30s)'))
      }
    }, 30000)

    const handleData = (data: Buffer) => {
      const text = data.toString()
      console.log(`[Tunnel] ${text.trim()}`)

      if (!resolved) {
        const match = text.match(urlRegex)
        if (match) {
          resolved = true
          clearTimeout(timeout)
          tunnelUrl = match[0]
          console.log(`[Tunnel] URL detected: ${tunnelUrl}`)
          notifyBackend(tunnelUrl).then(() => resolve(tunnelUrl))
        }
      }
    }

    proc.stdout?.on('data', handleData)
    proc.stderr?.on('data', handleData)

    proc.on('error', (err: Error) => {
      console.error('[Tunnel] Process error:', err.message)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        tunnelProcess = null
        tunnelUrl = ''
        reject(err)
      }
    })

    proc.on('exit', (code: number | null) => {
      console.log(`[Tunnel] Process exited with code ${code}`)
      tunnelProcess = null
      const oldUrl = tunnelUrl
      tunnelUrl = ''
      if (oldUrl) {
        notifyBackend('')
      }
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(new Error(`cloudflared exited with code ${code}`))
      }
    })
  })
}

/**
 * Stop the cloudflared tunnel.
 */
export async function stopTunnel(): Promise<void> {
  if (tunnelProcess) {
    console.log('[Tunnel] Stopping...')
    tunnelProcess.kill()
    tunnelProcess = null
  }
  tunnelUrl = ''
  await notifyBackend('')
}

/**
 * Get the current tunnel URL (empty string if not active).
 */
export function getTunnelUrl(): string {
  return tunnelUrl
}
