# Sancho Build Script
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Sancho Build Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow
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
Write-Host "[2/5] Building Python backend..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    python -m venv venv
}
& "venv\Scripts\activate.ps1"
pip install -r requirements.txt --quiet

# Install Playwright Chromium inside the package directory (for PyInstaller bundling)
$env:PLAYWRIGHT_BROWSERS_PATH = "0"
playwright install chromium
Write-Host "  Playwright Chromium installed" -ForegroundColor Green

# Build with PyInstaller
$playwrightPkg = python -c "import playwright; import os; print(os.path.dirname(playwright.__file__))"
$browsersSrc = Join-Path $playwrightPkg "driver\package\.local-browsers"
pyinstaller `
    --noconfirm `
    --distpath "dist-backend" `
    --name "main" `
    --add-data "backend/skills/definitions;backend/skills/definitions" `
    --add-data "$browsersSrc;playwright/driver/package/.local-browsers" `
    pyinstaller_entry.py

Write-Host "  Backend built to dist-backend/" -ForegroundColor Green
Write-Host ""

# Step 3: Install Node.js dependencies
Write-Host "[3/5] Installing Node.js dependencies..." -ForegroundColor Yellow
npm install --quiet
Write-Host "  Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 4: Build frontend and Electron
Write-Host "[4/5] Building frontend..." -ForegroundColor Yellow
npm run build
Write-Host "  Frontend built" -ForegroundColor Green
Write-Host ""

# Step 5: Package with electron-builder
Write-Host "[5/5] Packaging Electron app..." -ForegroundColor Yellow
npm run electron:build
Write-Host "  Package created in release/" -ForegroundColor Green
Write-Host ""

Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Installer: release\Sancho Setup *.exe" -ForegroundColor White
