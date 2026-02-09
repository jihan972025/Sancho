# Sancho Build Script
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Sancho Build Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow
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
Write-Host "[2/6] Building Python backend..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    python -m venv venv
}
& "venv\Scripts\activate.ps1"
pip install -r requirements.txt --quiet

# Build with PyInstaller
pyinstaller `
    --noconfirm `
    --distpath "dist-backend" `
    --name "main" `
    --add-data "backend/skills/definitions;backend/skills/definitions" `
    pyinstaller_entry.py

Write-Host "  Backend built to dist-backend/" -ForegroundColor Green
Write-Host ""

# Step 3: Install Node.js dependencies
Write-Host "[3/6] Installing Node.js dependencies..." -ForegroundColor Yellow
npm install --quiet
Write-Host "  Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 4: Install playwright-cli browser
Write-Host "[4/6] Installing playwright-cli browser..." -ForegroundColor Yellow
npx playwright-cli install
Write-Host "  playwright-cli browser installed" -ForegroundColor Green
Write-Host ""

# Step 5: Build frontend and Electron
Write-Host "[5/6] Building frontend..." -ForegroundColor Yellow
npm run build
Write-Host "  Frontend built" -ForegroundColor Green
Write-Host ""

# Step 6: Package with electron-builder
Write-Host "[6/6] Packaging Electron app..." -ForegroundColor Yellow
npm run electron:build
Write-Host "  Package created in release/" -ForegroundColor Green
Write-Host ""

Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Installer: release\Sancho Setup *.exe" -ForegroundColor White
