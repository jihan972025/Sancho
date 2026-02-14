import { BrowserWindow, app } from 'electron'
import { spawn } from 'child_process'
import https from 'https'
import fs from 'fs'
import path from 'path'

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

    // Find the .exe installer asset
    const installerAsset = release.assets.find((a) => a.name.endsWith('.exe') && a.name.includes('Setup'))
    if (!installerAsset) {
      return { success: false, error: 'No installer found in release.' }
    }

    // Download installer to temp directory
    const tempDir = app.getPath('temp')
    const installerPath = path.join(tempDir, installerAsset.name)

    console.log(`[Updater] Downloading installer: ${installerAsset.name} (${installerAsset.size} bytes)`)
    await httpsDownload(installerAsset.browser_download_url, installerPath, onProgress)
    console.log(`[Updater] Download complete: ${installerPath}`)

    // Create a batch script that waits for app to exit, runs installer, then relaunches
    const appExePath = process.execPath
    const batchPath = path.join(tempDir, 'sancho-update.bat')
    const batchContent = [
      '@echo off',
      'taskkill /F /IM "Sancho.exe" 2>nul',
      'taskkill /F /IM "main.exe" 2>nul',
      'timeout /t 5 /nobreak > nul',
      // /S = silent install (oneClick NSIS supports /S natively)
      `"${installerPath}" /S`,
      'timeout /t 3 /nobreak > nul',
      `start "" "${appExePath}"`,
      `del "${installerPath}" 2>nul`,
      'del "%~f0"',
    ].join('\r\n')
    fs.writeFileSync(batchPath, batchContent, 'utf-8')

    console.log(`[Updater] Launching update script: ${batchPath}`)
    const child = spawn('cmd.exe', ['/c', batchPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()

    // Exit app so installer can overwrite files
    setTimeout(() => {
      app.exit(0)
    }, 500)

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
