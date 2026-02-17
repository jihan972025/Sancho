# Sancho Build Script
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Sancho Build Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue

if (-not $python) { throw "Python not found. Install Python 3.10+" }
if (-not $node) { throw "Node.js not found. Install Node.js 18+" }
if (-not $npm) { throw "npm not found." }

Write-Host "  Python: $(python --version)" -ForegroundColor Green
Write-Host "  Node: $(node --version)" -ForegroundColor Green
Write-Host ""

# Step 2: Install Python dependencies and build backend
Write-Host "[2/7] Building Python backend..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    python -m venv venv
}
& "venv\Scripts\activate.ps1"
pip install -r requirements.txt --quiet

# Clean dist-backend to avoid stale files from previous builds
if (Test-Path "dist-backend") { Remove-Item "dist-backend" -Recurse -Force }

# Build with PyInstaller using main.spec (single source of truth)
# Use python -m PyInstaller to avoid venv shim issues
python -m PyInstaller main.spec --noconfirm --distpath "dist-backend"

# PyInstaller COLLECT creates dist-backend/main/ subdirectory (from spec name='main').
# Move contents to dist-backend/ root for electron-builder extraResources.
if (Test-Path "dist-backend/main") {
    # Use robocopy to move contents (handles directory merges correctly)
    robocopy "dist-backend/main" "dist-backend" /E /MOVE /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    if (Test-Path "dist-backend/main") { Remove-Item "dist-backend/main" -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host "  Backend built to dist-backend/" -ForegroundColor Green
Write-Host ""

# Step 3: Install Node.js dependencies
Write-Host "[3/7] Installing Node.js dependencies..." -ForegroundColor Yellow
npm install --quiet
Write-Host "  Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 4: Install playwright-cli browser
Write-Host "[4/7] Installing playwright-cli browser..." -ForegroundColor Yellow
npx playwright-cli install
Write-Host "  playwright-cli browser installed" -ForegroundColor Green
Write-Host ""

# Step 5: Build frontend and Electron
Write-Host "[5/7] Building frontend..." -ForegroundColor Yellow
npm run build
Write-Host "  Frontend built" -ForegroundColor Green
Write-Host ""

# Step 6: Package with electron-builder
Write-Host "[6/7] Packaging Electron app..." -ForegroundColor Yellow
npm run electron:build
Write-Host "  Package created in release/" -ForegroundColor Green
Write-Host ""

# Step 7: Generate differential patch assets (file-level diff)
Write-Host "[7/7] Generating patch assets..." -ForegroundColor Yellow

$version = (Get-Content package.json | ConvertFrom-Json).version
$patchDir = "release/patches"
New-Item -ItemType Directory -Force -Path $patchDir | Out-Null

# Remove old patch zips (keep file-hashes.json)
Get-ChildItem "$patchDir" -Filter "*.zip" -ErrorAction SilentlyContinue | Remove-Item -Force
Remove-Item "$patchDir/patch-manifest.json" -Force -ErrorAction SilentlyContinue

# Channel source directories and install targets
$channelSources = @{
    "frontend" = "dist"
    "electron" = "dist-electron"
    "backend"  = "dist-backend"
    "html"     = "html"
}

$targetMap = @{
    "frontend" = "app.asar.unpacked/dist"
    "electron" = "app.asar.unpacked/dist-electron"
    "backend"  = "backend"
    "html"     = "html"
}

# Load previous file hashes (from last build)
$hashFile = "$patchDir/file-hashes.json"
$prevHashes = @{}
if (Test-Path $hashFile) {
    $prevHashes = Get-Content $hashFile -Raw | ConvertFrom-Json
}

# Build current hashes and find changed files per channel
$currentHashes = @{}
$manifest = @{
    version = $version
    requires_full_update = $false
    min_version = "1.0.11"
    channels = @{}
}

# Load previous patch-version.json for per-channel versioning
$prevPatchVersion = @{ version = $version; channels = @{ frontend = $version; electron = $version; backend = $version; html = $version } }
if (Test-Path "patch-version.json") {
    try {
        $prevPatchVersion = Get-Content "patch-version.json" -Raw | ConvertFrom-Json
    } catch {}
}
$newPatchVersion = @{
    version = $version
    channels = @{}
}

foreach ($channel in @("frontend", "electron", "backend", "html")) {
    $srcDir = $channelSources[$channel]
    if (-not (Test-Path $srcDir)) {
        # Channel directory doesn't exist, keep previous version
        $prevChVer = $version
        if ($prevPatchVersion.channels.PSObject.Properties.Name -contains $channel) {
            $prevChVer = $prevPatchVersion.channels.$channel
        }
        $newPatchVersion.channels[$channel] = $prevChVer
        continue
    }

    # Compute SHA256 for every file in channel directory
    $channelHashes = @{}
    Get-ChildItem $srcDir -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring((Resolve-Path $srcDir).Path.Length + 1).Replace('\', '/')
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
        $channelHashes[$relativePath] = $hash
    }
    $currentHashes[$channel] = $channelHashes

    # Compare with previous hashes to find changed/added files
    $prevChannelHashes = @{}
    if ($prevHashes.PSObject.Properties.Name -contains $channel) {
        $prevObj = $prevHashes.$channel
        foreach ($prop in $prevObj.PSObject.Properties) {
            $prevChannelHashes[$prop.Name] = $prop.Value
        }
    }

    $changedFiles = @()
    foreach ($relPath in $channelHashes.Keys) {
        if (-not $prevChannelHashes.ContainsKey($relPath) -or $prevChannelHashes[$relPath] -ne $channelHashes[$relPath]) {
            $changedFiles += $relPath
        }
    }

    if ($changedFiles.Count -eq 0) {
        Write-Host "  $channel : no changes (skipped)" -ForegroundColor DarkGray
        # Keep previous version for this channel
        $prevChVer = $version
        if ($prevPatchVersion.channels.PSObject.Properties.Name -contains $channel) {
            $prevChVer = $prevPatchVersion.channels.$channel
        }
        $newPatchVersion.channels[$channel] = $prevChVer
        continue
    }

    # Create zip with only changed files (preserving directory structure)
    $zipFile = "$patchDir/patch-$channel-$version.zip"
    $stagingDir = "$patchDir/_staging_$channel"
    if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

    foreach ($relPath in $changedFiles) {
        $srcFile = Join-Path $srcDir $relPath.Replace('/', '\')
        $destFile = Join-Path $stagingDir $relPath.Replace('/', '\')
        $destDir = Split-Path $destFile -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item $srcFile $destFile -Force
    }

    Compress-Archive -Path "$stagingDir/*" -DestinationPath $zipFile -Force
    Remove-Item $stagingDir -Recurse -Force

    $zipHash = (Get-FileHash $zipFile -Algorithm SHA256).Hash.ToLower()
    $zipSize = (Get-Item $zipFile).Length
    $manifest.channels[$channel] = @{
        asset  = "patch-$channel-$version.zip"
        size   = $zipSize
        sha256 = $zipHash
        target = $targetMap[$channel]
    }

    $sizeMB = [math]::Round($zipSize / 1MB, 2)
    Write-Host "  patch-$channel-$version.zip  ($($changedFiles.Count) files, ${sizeMB} MB)" -ForegroundColor Gray
    $newPatchVersion.channels[$channel] = $version
}

# Save manifest (only changed channels included)
$manifest | ConvertTo-Json -Depth 5 | Set-Content "$patchDir/patch-manifest.json"
Write-Host "  patch-manifest.json" -ForegroundColor Gray

# Save current file hashes for next build comparison
$currentHashes | ConvertTo-Json -Depth 3 -Compress | Set-Content $hashFile
Write-Host "  file-hashes.json (updated)" -ForegroundColor DarkGray

# Save patch-version.json
$newPatchVersion | ConvertTo-Json -Depth 3 | Set-Content "patch-version.json"

# Summary
Write-Host ""
Write-Host "  Patch assets:" -ForegroundColor Green
$totalPatchSize = 0
foreach ($channel in @("frontend", "electron", "backend", "html")) {
    $zipFile = "$patchDir/patch-$channel-$version.zip"
    if (Test-Path $zipFile) {
        $sizeMB = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
        $totalPatchSize += (Get-Item $zipFile).Length
        Write-Host "    $channel : ${sizeMB} MB" -ForegroundColor Gray
    } else {
        Write-Host "    $channel : -- (unchanged)" -ForegroundColor DarkGray
    }
}
$totalMB = [math]::Round($totalPatchSize / 1MB, 2)
Write-Host "    total   : ${totalMB} MB" -ForegroundColor White
$installerSize = [math]::Round((Get-Item "release/Sancho Setup $version.exe").Length / 1MB, 1)
Write-Host "    full    : ${installerSize} MB" -ForegroundColor Gray
Write-Host ""

Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Installer : release\Sancho Setup $version.exe" -ForegroundColor White
Write-Host "Patches   : release\patches\" -ForegroundColor White
