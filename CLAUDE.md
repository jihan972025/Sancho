# Sancho - AI Agent Desktop App

## Architecture

- **Frontend**: Electron + React (Vite + Tailwind CSS), `src/`
- **Backend**: Python FastAPI on port 8765, `backend/`
- **Electron main process**: `electron/main.ts` spawns backend as subprocess
- **Build**: `build.ps1` (PyInstaller + Vite + electron-builder)

## Project Structure

```
electron/           # Electron main process (TypeScript)
  main.ts           # App entry, backend spawn, IPC handlers
  preload.ts        # Context bridge (electronAPI)
  updater.ts        # Differential update system
  whatsapp.ts       # WhatsApp integration
  telegram.ts       # Telegram integration
  matrix.ts         # Matrix integration
  slack.ts          # Slack integration (Socket Mode)
  tunnel.ts         # Cloudflare tunnel
  googleAuth.ts     # Google OAuth
  outlookAuth.ts    # Microsoft Outlook OAuth

src/                # React frontend (TypeScript)
  components/
    Chat/           # Chat UI
    Crypto/         # Crypto dashboard
    Scheduler/      # Task scheduler
    Settings/       # Settings panel
    AutoTrading/    # Auto-trading UI
    PatchNotification.tsx  # Update notification

backend/            # Python FastAPI backend
  main.py           # FastAPI app + middleware
  config.py         # Config management
  api/              # Route handlers
    routes_chat.py
    routes_file.py
    routes_browser.py
    routes_settings.py
    routes_voice.py
    routes_crypto.py
    routes_scheduler.py
    routes_autotrading.py
    routes_conversation.py
    routes_memory.py
    routes_logs.py
    routes_whatsapp.py
    routes_telegram.py
    routes_matrix.py
    routes_slack.py
    routes_google_auth.py
    routes_outlook_auth.py
  llm/              # LLM provider integrations (10 providers)
  agents/           # AI agent orchestration
  browser/          # Browser agent (@playwright/cli)
  skills/           # Skill definitions (Markdown)
  middleware/       # Tunnel guard, rate limiter
  scheduler/        # APScheduler tasks
  autotrading/      # Crypto auto-trading engine

html/               # Voice chat web app (served by backend)
assets/             # Build assets (icons, NSIS installer script)
```

## Build & Package

```powershell
# Full build (7 steps)
powershell -ExecutionPolicy Bypass -File build.ps1

# Backend only (PyInstaller)
pyinstaller main.spec --noconfirm --distpath "dist-backend"

# Frontend only
npm run build

# Package only (electron-builder)
npm run electron:build
```

**Output**:
- `release/Sancho Setup {version}.exe` — Full NSIS installer
- `release/patches/` — Differential patch zips + manifest

## Production File Layout

```
resources/
  app.asar                          # node_modules (read-only)
  app.asar.unpacked/
    dist/                           # React frontend (patchable)
    dist-electron/                  # Electron JS (patchable)
    node_modules/@playwright/cli/   # Browser agent
  backend/
    main.exe                        # PyInstaller backend (patchable)
    _internal/                      # Python dependencies
  html/                             # Voice app (patchable)
  patch-version.json                # Channel version tracking
```

Key: `dist/` and `dist-electron/` are in `asarUnpack` so they exist as real files and can be overwritten by the differential updater.

## Differential Update System

4 channels: `frontend`, `electron`, `backend`, `html`

### Update Flow
1. **Release**: Upload `Sancho Setup *.exe` + `release/patches/*.zip` + `patch-manifest.json` to GitHub Release
2. **Client**: Download `patch-manifest.json` first → identify changed channels → download only those zips
3. **Frontend/html only**: Hot-reload without restart (~200KB)
4. **Backend/Electron**: Batch script kills app → extract zips → restart (~25MB)
5. **`requires_full_update: true`**: Fallback to full installer (~138MB)

### Key Files
- `electron/updater.ts` — Update logic (manifest, SHA-256, hot-reload/restart)
- `build.ps1` — Step 7 generates patch zips + `patch-manifest.json`
- `patch-version.json` — Tracks installed version per channel
- `electron-builder.yml` — `asarUnpack` and `extraResources` config

## Backend Startup

1. `electron/main.ts` → `findPythonBackend()` → `resources/backend/main.exe`
2. Spawns as subprocess with `SANCHO_PLAYWRIGHT_CLI_JS` env var (path to `@playwright/cli` entry point)
3. Frontend polls `/api/health` until backend is ready
4. Backend runs FastAPI on `127.0.0.1:8765`

## Browser Agent (@playwright/cli)

- Uses `@playwright/cli` (Node.js CLI, not Python Playwright)
- Text snapshots (accessibility tree with `[ref=eN]`) instead of screenshots — no Vision API needed
- CLI wrapper: `backend/browser/playwright_cli.py` (async subprocess)
- Session name: `sancho` (`-s=sancho`)
- Agent loop: `snapshot()` → LLM (text) → ref-based JSON action → execute → repeat (max 20 steps)
- Duplicate action detection: identical action repeated 3x → auto-stop
- Conversation history preserved across steps for multi-step context
- Production bundling: `node_modules/@playwright/cli/` in `asarUnpack`

## Dev Commands

```bash
# Start backend (dev)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765

# Start frontend (dev)
npm run dev

# Start Electron (dev)
npm run electron:dev
```
