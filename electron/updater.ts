import { BrowserWindow, app } from 'electron'
import { spawn, execSync } from 'child_process'
import crypto from 'crypto'
import https from 'https'
import fs from 'fs'
import path from 'path'

const GITHUB_API_URL = 'https://api.github.com/repos/jihan972025/sancho/releases/latest'
const CHECK_INTERVAL = 60 * 60 * 1000 // 60 minutes
const INITIAL_DELAY = 10 * 1000 // 10 seconds

const CHANNEL_NAMES = ['frontend', 'electron', 'backend', 'html'] as const
type Channel = (typeof CHANNEL_NAMES)[number]

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
  version: string
  requires_full_update: boolean
  min_version: string
  channels: Record<string, {
    asset: string
    size: number
    sha256: string
    target: string
  }>
}

interface PatchVersionFile {
  version: string
  channels: Record<string, string>
}

export interface UpdateCheckResult {
  available: boolean
  version?: string
  notes?: string
  patchSize?: number
  channels?: string[]
  fullOnly?: boolean
}

let periodicTimer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null
let dismissedVersion: string | null = null
let win: BrowserWindow | null = null

// ── Network helpers ────────────────────────────────────────────

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'Sancho-Updater' } }
    https.get(url, options, (res) => {
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

function httpsDownload(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'Sancho-Updater' } }
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
        onProgress?.(downloaded, totalSize)
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', (err) => { fs.unlinkSync(destPath); reject(err) })
    }).on('error', reject)
  })
}

// ── Version helpers ────────────────────────────────────────────

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

function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Local version tracking ─────────────────────────────────────

function getLocalPatchVersion(): PatchVersionFile {
  try {
    const versionPath = path.join(process.resourcesPath, 'patch-version.json')
    return JSON.parse(fs.readFileSync(versionPath, 'utf-8'))
  } catch {
    const v = app.getVersion()
    return { version: v, channels: { frontend: v, electron: v, backend: v, html: v } }
  }
}

function saveLocalPatchVersion(pv: PatchVersionFile): void {
  try {
    const versionPath = path.join(process.resourcesPath, 'patch-version.json')
    fs.writeFileSync(versionPath, JSON.stringify(pv, null, 2))
  } catch (err) {
    console.error('[Updater] Failed to save patch-version.json:', (err as Error).message)
  }
}

// ── Release helpers ────────────────────────────────────────────

function getAssetUrl(release: ReleaseInfo, assetName: string): string | null {
  const asset = release.assets.find((a) => a.name === assetName)
  return asset ? asset.browser_download_url : null
}

async function fetchManifest(release: ReleaseInfo): Promise<PatchManifest | null> {
  const url = getAssetUrl(release, 'patch-manifest.json')
  if (!url) return null
  try {
    const data = await httpsGet(url)
    return JSON.parse(data) as PatchManifest
  } catch {
    return null
  }
}

// ── Check for update ───────────────────────────────────────────

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const data = await httpsGet(GITHUB_API_URL)
    const release: ReleaseInfo = JSON.parse(data)
    const currentVersion = app.getVersion()
    const remoteVersion = release.tag_name.replace(/^v/, '')

    if (!compareVersions(currentVersion, remoteVersion)) {
      return { available: false }
    }

    // Try to get patch manifest for size/channel info
    const manifest = await fetchManifest(release)

    if (!manifest || manifest.requires_full_update) {
      const installerAsset = release.assets.find((a) => a.name.endsWith('.exe') && a.name.includes('Setup'))
      return {
        available: true,
        version: remoteVersion,
        notes: release.body || release.name,
        patchSize: installerAsset?.size || 0,
        channels: [],
        fullOnly: true,
      }
    }

    // Check min_version: if installed version is too old → full only
    if (compareVersions(currentVersion, manifest.min_version)) {
      const installerAsset = release.assets.find((a) => a.name.endsWith('.exe') && a.name.includes('Setup'))
      return {
        available: true,
        version: remoteVersion,
        notes: release.body || release.name,
        patchSize: installerAsset?.size || 0,
        channels: [],
        fullOnly: true,
      }
    }

    // Determine which channels changed
    const local = getLocalPatchVersion()
    const changedChannels: string[] = []
    let totalPatchSize = 0

    for (const ch of CHANNEL_NAMES) {
      const channelInfo = manifest.channels[ch]
      if (!channelInfo) continue
      const localVer = local.channels[ch] || local.version
      if (localVer !== manifest.version) {
        changedChannels.push(ch)
        totalPatchSize += channelInfo.size
      }
    }

    return {
      available: true,
      version: remoteVersion,
      notes: release.body || release.name,
      patchSize: totalPatchSize,
      channels: changedChannels,
      fullOnly: false,
    }
  } catch (err) {
    console.log('[Updater] Check failed:', (err as Error).message)
    return { available: false }
  }
}

// ── Full installer update (existing approach) ──────────────────

async function applyFullUpdate(
  onProgress?: (percent: number) => void,
): Promise<{ success: boolean; error?: string }> {
  const data = await httpsGet(GITHUB_API_URL)
  const release: ReleaseInfo = JSON.parse(data)

  const installerAsset = release.assets.find((a) => a.name.endsWith('.exe') && a.name.includes('Setup'))
  if (!installerAsset) {
    return { success: false, error: 'No installer found in release.' }
  }

  const tempDir = app.getPath('temp')
  const installerPath = path.join(tempDir, installerAsset.name)

  console.log(`[Updater] Downloading installer: ${installerAsset.name} (${formatSize(installerAsset.size)})`)
  await httpsDownload(installerAsset.browser_download_url, installerPath, (downloaded, total) => {
    if (total > 0) onProgress?.(Math.round((downloaded / total) * 100))
  })

  const appExePath = process.execPath
  const batchPath = path.join(tempDir, 'sancho-update.bat')
  const vbsPath = path.join(tempDir, 'sancho-update.vbs')
  const logPath = path.join(tempDir, 'sancho-update.log')

  const batchContent = [
    '@echo off',
    `echo [%date% %time%] Full update started >> "${logPath}"`,
    'taskkill /F /IM "Sancho.exe" 2>nul',
    'taskkill /F /IM "main.exe" 2>nul',
    'taskkill /F /IM "cloudflared.exe" 2>nul',
    `echo [%date% %time%] Processes killed >> "${logPath}"`,
    'ping -n 6 127.0.0.1 > nul 2>&1',
    `echo [%date% %time%] Running installer... >> "${logPath}"`,
    `"${installerPath}" /S`,
    `echo [%date% %time%] Installer exited (%ERRORLEVEL%) >> "${logPath}"`,
    'ping -n 4 127.0.0.1 > nul 2>&1',
    `start "" "${appExePath}"`,
    `del "${installerPath}" 2>nul`,
    `echo [%date% %time%] Complete >> "${logPath}"`,
    'del "%~f0" 2>nul',
  ].join('\r\n')
  fs.writeFileSync(batchPath, batchContent)

  const vbsContent = `CreateObject("Wscript.Shell").Run """${batchPath}""", 0, False`
  fs.writeFileSync(vbsPath, vbsContent)

  const child = spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' })
  child.unref()
  setTimeout(() => app.exit(0), 500)

  return { success: true }
}

// ── Differential patch update ──────────────────────────────────

async function applyDifferentialPatch(
  onProgress?: (percent: number, channel?: string) => void,
): Promise<{ success: boolean; error?: string }> {
  const data = await httpsGet(GITHUB_API_URL)
  const release: ReleaseInfo = JSON.parse(data)
  const manifest = await fetchManifest(release)
  if (!manifest) return { success: false, error: 'Patch manifest not found.' }

  // Determine channels to update
  const local = getLocalPatchVersion()
  const channelsToUpdate: Channel[] = []
  for (const ch of CHANNEL_NAMES) {
    const info = manifest.channels[ch]
    if (!info) continue
    if ((local.channels[ch] || local.version) !== manifest.version) {
      channelsToUpdate.push(ch)
    }
  }
  if (channelsToUpdate.length === 0) return { success: true }

  // Total download size for progress tracking
  const totalSize = channelsToUpdate.reduce((sum, ch) => sum + manifest.channels[ch].size, 0)
  let downloadedOverall = 0

  // Create staging directory
  const stagingDir = path.join(app.getPath('temp'), 'sancho-patch')
  fs.mkdirSync(stagingDir, { recursive: true })

  // Download all needed patches
  for (const ch of channelsToUpdate) {
    const info = manifest.channels[ch]
    const assetUrl = getAssetUrl(release, info.asset)
    if (!assetUrl) {
      fs.rmSync(stagingDir, { recursive: true, force: true })
      return { success: false, error: `Patch asset not found: ${info.asset}` }
    }

    const destPath = path.join(stagingDir, info.asset)
    console.log(`[Updater] Downloading ${ch} patch: ${info.asset} (${formatSize(info.size)})`)

    const channelStart = downloadedOverall
    await httpsDownload(assetUrl, destPath, (downloaded) => {
      if (totalSize > 0) {
        onProgress?.(Math.min(Math.round(((channelStart + downloaded) / totalSize) * 100), 99), ch)
      }
    })
    downloadedOverall += info.size

    // Verify SHA-256
    const actualHash = await fileSha256(destPath)
    if (actualHash !== info.sha256) {
      console.error(`[Updater] SHA-256 mismatch for ${ch}`)
      fs.rmSync(stagingDir, { recursive: true, force: true })
      return { success: false, error: `Checksum mismatch for ${ch} patch.` }
    }
    console.log(`[Updater] ${ch} verified OK`)
  }

  onProgress?.(100)

  // Decide: hot-reload or restart
  const needsRestart = channelsToUpdate.some((ch) => ch === 'electron' || ch === 'backend')

  if (needsRestart) {
    return applyWithRestart(stagingDir, channelsToUpdate, manifest)
  } else {
    return applyHotReload(stagingDir, channelsToUpdate, manifest)
  }
}

// ── Hot-reload (frontend/html only — no restart) ───────────────

function applyHotReload(
  stagingDir: string,
  channels: Channel[],
  manifest: PatchManifest,
): { success: boolean; error?: string } {
  try {
    for (const ch of channels) {
      const info = manifest.channels[ch]
      const zipPath = path.join(stagingDir, info.asset)
      const targetDir = path.join(process.resourcesPath, info.target)

      console.log(`[Updater] Hot-apply ${ch} → ${targetDir}`)
      fs.mkdirSync(targetDir, { recursive: true })
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Force '${zipPath}' '${targetDir}'"`,
        { timeout: 60000 },
      )
    }

    // Update local version
    const local = getLocalPatchVersion()
    for (const ch of channels) local.channels[ch] = manifest.version
    local.version = manifest.version
    saveLocalPatchVersion(local)

    // Cleanup staging
    fs.rmSync(stagingDir, { recursive: true, force: true })

    // Reload renderer
    if (win && !win.isDestroyed()) win.webContents.reload()
    console.log('[Updater] Hot-reload complete')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// ── Restart-required apply (backend/electron changes) ──────────

function applyWithRestart(
  stagingDir: string,
  channels: Channel[],
  manifest: PatchManifest,
): { success: boolean; error?: string } {
  const tempDir = app.getPath('temp')
  const appExePath = process.execPath
  const installDir = path.dirname(appExePath)
  const batchPath = path.join(tempDir, 'sancho-patch.bat')
  const vbsPath = path.join(tempDir, 'sancho-patch.vbs')
  const logPath = path.join(tempDir, 'sancho-patch.log')

  // Build extraction commands per channel
  const extractCmds: string[] = []
  for (const ch of channels) {
    const info = manifest.channels[ch]
    const zipPath = path.join(stagingDir, info.asset).replace(/\//g, '\\')
    const targetDir = path.join(installDir, 'resources', info.target).replace(/\//g, '\\')
    extractCmds.push(
      `echo [%date% %time%] Extracting ${ch}... >> "${logPath}"`,
      `powershell -NoProfile -Command "Expand-Archive -Force '${zipPath}' '${targetDir}'"`,
      `if %ERRORLEVEL% NEQ 0 (echo [%date% %time%] FAILED: ${ch} >> "${logPath}" & goto :error)`,
    )
  }

  // Build updated patch-version.json
  const local = getLocalPatchVersion()
  for (const ch of channels) local.channels[ch] = manifest.version
  local.version = manifest.version
  const versionJsonPath = path.join(installDir, 'resources', 'patch-version.json').replace(/\//g, '\\')
  // Write as a temp file then copy (avoid echo quoting issues)
  const versionTmpPath = path.join(tempDir, 'patch-version-new.json').replace(/\//g, '\\')
  fs.writeFileSync(versionTmpPath.replace(/\\\\/g, '\\'), JSON.stringify(local, null, 2))

  const batchContent = [
    '@echo off',
    `echo [%date% %time%] Differential patch started >> "${logPath}"`,
    'taskkill /F /IM "Sancho.exe" 2>nul',
    'taskkill /F /IM "main.exe" 2>nul',
    'taskkill /F /IM "cloudflared.exe" 2>nul',
    `echo [%date% %time%] Processes killed >> "${logPath}"`,
    'ping -n 4 127.0.0.1 > nul 2>&1',
    '',
    ...extractCmds,
    '',
    `echo [%date% %time%] Updating version... >> "${logPath}"`,
    `copy /Y "${versionTmpPath}" "${versionJsonPath}" >nul`,
    '',
    `echo [%date% %time%] Cleaning staging... >> "${logPath}"`,
    `rmdir /S /Q "${stagingDir.replace(/\//g, '\\')}" 2>nul`,
    `del "${versionTmpPath}" 2>nul`,
    '',
    'ping -n 3 127.0.0.1 > nul 2>&1',
    `echo [%date% %time%] Launching app... >> "${logPath}"`,
    `start "" "${appExePath}"`,
    `echo [%date% %time%] Patch complete >> "${logPath}"`,
    'goto :end',
    '',
    ':error',
    `echo [%date% %time%] Patch FAILED >> "${logPath}"`,
    `start "" "${appExePath}"`,
    '',
    ':end',
    'del "%~f0" 2>nul',
  ].join('\r\n')
  fs.writeFileSync(batchPath, batchContent)

  const vbsContent = `CreateObject("Wscript.Shell").Run """${batchPath}""", 0, False`
  fs.writeFileSync(vbsPath, vbsContent)

  console.log(`[Updater] Launching patch script: ${vbsPath}`)
  console.log(`[Updater] Batch path: ${batchPath}`)
  console.log(`[Updater] VBS content: ${vbsContent}`)

  // Verify files exist before spawning
  if (!fs.existsSync(batchPath)) {
    return { success: false, error: `Batch file not created: ${batchPath}` }
  }
  if (!fs.existsSync(vbsPath)) {
    return { success: false, error: `VBS file not created: ${vbsPath}` }
  }

  const child = spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' })
  child.unref()
  setTimeout(() => app.exit(0), 1000)

  return { success: true }
}

// ── Main entry: applyPatch ─────────────────────────────────────

export async function applyPatch(
  onProgress?: (percent: number, channel?: string) => void,
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await httpsGet(GITHUB_API_URL)
    const release: ReleaseInfo = JSON.parse(data)
    const manifest = await fetchManifest(release)

    // No manifest or full update required → full installer
    if (!manifest || manifest.requires_full_update) {
      console.log('[Updater] Using full installer update')
      return applyFullUpdate((percent) => onProgress?.(percent))
    }

    // Current version too old → full installer
    const currentVersion = app.getVersion()
    if (compareVersions(currentVersion, manifest.min_version)) {
      console.log(`[Updater] ${currentVersion} < min ${manifest.min_version}, full installer`)
      return applyFullUpdate((percent) => onProgress?.(percent))
    }

    // Differential patch
    console.log('[Updater] Using differential patch')
    return applyDifferentialPatch(onProgress)
  } catch (err) {
    console.log('[Updater] Diff patch failed, fallback to full:', (err as Error).message)
    return applyFullUpdate((percent) => onProgress?.(percent))
  }
}

// ── Periodic check ─────────────────────────────────────────────

async function doCheck(): Promise<void> {
  if (!win || win.isDestroyed()) return
  const result = await checkForUpdate()
  if (result.available && result.version !== dismissedVersion) {
    win.webContents.send('patch:available', {
      version: result.version,
      notes: result.notes,
      patchSize: result.patchSize,
      channels: result.channels,
      fullOnly: result.fullOnly,
    })
  }
}

export function startPeriodicCheck(mainWindow: BrowserWindow): void {
  win = mainWindow
  initialTimer = setTimeout(() => {
    doCheck()
    periodicTimer = setInterval(doCheck, CHECK_INTERVAL)
  }, INITIAL_DELAY)
}

export function stopPeriodicCheck(): void {
  if (initialTimer) { clearTimeout(initialTimer); initialTimer = null }
  if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null }
  win = null
}

export function dismissUpdate(version: string): void {
  dismissedVersion = version
}
