import { BrowserWindow, app } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const GITHUB_API_URL = 'https://api.github.com/repos/jihan972025/sancho/releases/latest'
const CHECK_INTERVAL = 60 * 60 * 1000 // 60 minutes
const INITIAL_DELAY = 10 * 1000 // 10 seconds

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface ReleaseInfo {
  tag_name: string
  name: string
  body: string
  assets: ReleaseAsset[]
}

interface PatchManifest {
  files: Array<{
    path: string
    sha256: string
    url: string
    size: number
  }>
}

let periodicTimer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null
let dismissedVersion: string | null = null
let win: BrowserWindow | null = null

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'Sancho-Updater' },
    }
    https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function httpsDownload(url: string, destPath: string, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'Sancho-Updater' },
    }
    https.get(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsDownload(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const totalSize = parseInt(res.headers['content-length'] || '0', 10)
      let downloaded = 0
      const file = fs.createWriteStream(destPath)
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (totalSize > 0 && onProgress) {
          onProgress(Math.round((downloaded / totalSize) * 100))
        }
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', (err) => { fs.unlinkSync(destPath); reject(err) })
    }).on('error', reject)
  })
}

function compareVersions(current: string, remote: string): boolean {
  // Returns true if remote is newer than current
  const cleanVer = (v: string) => v.replace(/^v/, '')
  const cParts = cleanVer(current).split('.').map(Number)
  const rParts = cleanVer(remote).split('.').map(Number)
  for (let i = 0; i < Math.max(cParts.length, rParts.length); i++) {
    const c = cParts[i] || 0
    const r = rParts[i] || 0
    if (r > c) return true
    if (r < c) return false
  }
  return false
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export async function checkForUpdate(): Promise<{ available: boolean; version?: string; notes?: string }> {
  try {
    const data = await httpsGet(GITHUB_API_URL)
    const release: ReleaseInfo = JSON.parse(data)
    const currentVersion = app.getVersion()
    const remoteVersion = release.tag_name.replace(/^v/, '')

    if (compareVersions(currentVersion, remoteVersion)) {
      return {
        available: true,
        version: remoteVersion,
        notes: release.body || release.name,
      }
    }
    return { available: false }
  } catch (err) {
    console.log('[Updater] Check failed:', (err as Error).message)
    return { available: false }
  }
}

export async function applyPatch(onProgress?: (percent: number) => void): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await httpsGet(GITHUB_API_URL)
    const release: ReleaseInfo = JSON.parse(data)

    // Look for patch manifest asset
    const manifestAsset = release.assets.find((a) => a.name === 'patch-manifest.json')
    if (!manifestAsset) {
      return { success: false, error: 'No patch manifest found in release. Full reinstall may be required.' }
    }

    // Download manifest
    const manifestData = await httpsGet(manifestAsset.browser_download_url)
    const manifest: PatchManifest = JSON.parse(manifestData)

    if (!manifest.files || manifest.files.length === 0) {
      return { success: false, error: 'Empty patch manifest' }
    }

    const appRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
    const tempDir = path.join(app.getPath('temp'), 'sancho-patch')

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const totalFiles = manifest.files.length
    let completedFiles = 0

    // Download and verify each file
    for (const file of manifest.files) {
      const tempFile = path.join(tempDir, path.basename(file.path))

      await httpsDownload(file.url, tempFile, (percent) => {
        const overallPercent = Math.round(((completedFiles + percent / 100) / totalFiles) * 100)
        onProgress?.(overallPercent)
      })

      // Verify SHA-256
      const hash = await sha256File(tempFile)
      if (hash !== file.sha256) {
        // Clean up
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, error: `Hash mismatch for ${file.path}` }
      }

      // Copy to target location
      const targetPath = path.join(appRoot, file.path)
      const targetDir = path.dirname(targetPath)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      fs.copyFileSync(tempFile, targetPath)
      completedFiles++
      onProgress?.(Math.round((completedFiles / totalFiles) * 100))
    }

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

async function doCheck(): Promise<void> {
  if (!win || win.isDestroyed()) return
  const result = await checkForUpdate()
  if (result.available && result.version !== dismissedVersion) {
    win.webContents.send('patch:available', {
      version: result.version,
      notes: result.notes,
    })
  }
}

export function startPeriodicCheck(mainWindow: BrowserWindow): void {
  win = mainWindow
  // Initial check after delay
  initialTimer = setTimeout(() => {
    doCheck()
    // Then periodic checks
    periodicTimer = setInterval(doCheck, CHECK_INTERVAL)
  }, INITIAL_DELAY)
}

export function stopPeriodicCheck(): void {
  if (initialTimer) {
    clearTimeout(initialTimer)
    initialTimer = null
  }
  if (periodicTimer) {
    clearInterval(periodicTimer)
    periodicTimer = null
  }
  win = null
}

export function dismissUpdate(version: string): void {
  dismissedVersion = version
}
