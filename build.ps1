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

# Build with PyInstaller using main.spec (single source of truth)
pyinstaller main.spec --noconfirm --distpath "dist-backend"

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

# Step 7: Generate differential patch assets
Write-Host "[7/7] Generating patch assets..." -ForegroundColor Yellow

$version = (Get-Content package.json | ConvertFrom-Json).version
$patchDir = "release/patches"
New-Item -ItemType Directory -Force -Path $patchDir | Out-Null

# Remove old patches
Remove-Item "$patchDir/*" -Force -ErrorAction SilentlyContinue

# Frontend patch
Compress-Archive -Path "dist/*" -DestinationPath "$patchDir/patch-frontend-$version.zip" -Force
Write-Host "  patch-frontend-$version.zip" -ForegroundColor Gray

# Electron patch
Compress-Archive -Path "dist-electron/*" -DestinationPath "$patchDir/patch-electron-$version.zip" -Force
Write-Host "  patch-electron-$version.zip" -ForegroundColor Gray

# Backend patch
Compress-Archive -Path "dist-backend/*" -DestinationPath "$patchDir/patch-backend-$version.zip" -Force
Write-Host "  patch-backend-$version.zip" -ForegroundColor Gray

# HTML patch (if html/ exists)
if (Test-Path "html") {
    Compress-Archive -Path "html/*" -DestinationPath "$patchDir/patch-html-$version.zip" -Force
    Write-Host "  patch-html-$version.zip" -ForegroundColor Gray
}

# Generate patch-manifest.json
$manifest = @{
    version = $version
    requires_full_update = $false
    min_version = "1.0.11"
    channels = @{}
}

$targetMap = @{
    "frontend" = "app.asar.unpacked/dist"
    "electron" = "app.asar.unpacked/dist-electron"
    "backend"  = "backend"
    "html"     = "html"
}

foreach ($channel in @("frontend", "electron", "backend", "html")) {
    $zipFile = "$patchDir/patch-$channel-$version.zip"
    if (Test-Path $zipFile) {
        $hash = (Get-FileHash $zipFile -Algorithm SHA256).Hash.ToLower()
        $size = (Get-Item $zipFile).Length
        $manifest.channels[$channel] = @{
            asset  = "patch-$channel-$version.zip"
            size   = $size
            sha256 = $hash
            target = $targetMap[$channel]
        }
    }
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content "$patchDir/patch-manifest.json"
Write-Host "  patch-manifest.json" -ForegroundColor Gray

# Generate patch-version.json (included as extraResource in build)
$patchVersion = @{
    version = $version
    channels = @{
        frontend = $version
        electron = $version
        backend  = $version
        html     = $version
    }
}
$patchVersion | ConvertTo-Json | Set-Content "patch-version.json"

# Summary
Write-Host ""
Write-Host "  Patch assets:" -ForegroundColor Green
foreach ($channel in @("frontend", "electron", "backend", "html")) {
    $zipFile = "$patchDir/patch-$channel-$version.zip"
    if (Test-Path $zipFile) {
        $sizeMB = [math]::Round((Get-Item $zipFile).Length / 1MB, 1)
        Write-Host "    $channel : ${sizeMB} MB" -ForegroundColor Gray
    }
}
$installerSize = [math]::Round((Get-Item "release/Sancho Setup $version.exe").Length / 1MB, 1)
Write-Host "    full    : ${installerSize} MB" -ForegroundColor Gray
Write-Host ""

Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Installer : release\Sancho Setup $version.exe" -ForegroundColor White
Write-Host "Patches   : release\patches\" -ForegroundColor White
