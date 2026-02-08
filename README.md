<p align="center">
  <img src="img/apple-touch-icon.png" width="120" alt="Sancho Logo">
</p>

<h1 align="center">Sancho</h1>

<p align="center">
  <b>AI Agent Desktop App for Windows</b><br>
  Multi-LLM Chat &bull; File Management &bull; Browser Automation &bull; Messenger Integration
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue?logo=windows" alt="Windows Only">
</p>

> **Windows Only** — Sancho is designed and built exclusively for **Windows 10/11**. It is not supported on macOS or Linux.

---

## Overview

Sancho is a local AI agent desktop app for Windows 10/11. It connects to multiple LLM providers and offers chat, file management, browser automation, and messenger integration — all in one place.

## Use Cases

- **Chat with LLMs from your phone** — Connect WhatsApp, Telegram, or Element X and interact with AI models directly from your mobile chat app, anytime and anywhere.
- **Get weekly weather forecasts** — Ask Sancho to search for the latest weather information and receive a summary via chat or messenger.
- **Crypto technical analysis** — Get real-time technical analysis for Bitcoin, Ethereum, and other cryptocurrencies with up-to-date price data.
- **Organize files automatically** — Let the AI sort your downloads folder by file type with a single command.
- **Automate browser tasks** — Have Sancho navigate websites, fill out forms, and extract information hands-free.
- **Schedule recurring tasks** — Set up automated jobs that run on a schedule and send results to your messenger.

## Architecture

```
Electron + React (Vite + Tailwind)  ← Desktop UI
        │ REST API + SSE
Python FastAPI Backend (port 8765)  ← Subprocess managed by Electron
  ├── 10+ LLM Providers
  ├── Skill System (Search, File, Custom API)
  ├── File Agent
  └── Browser Agent (Playwright)
```

## Features

### Multi-LLM Chat
- **10+ LLM providers**: OpenAI, Anthropic, Google Gemini, DeepSeek, Grok, Mistral, Perplexity, Qwen, ZhipuAI, Llama (Together AI), GitHub Models
- Real-time SSE streaming responses
- Switch between models freely

### Skill System
- **Web Search**: DuckDuckGo, Tavily
- **File Operations**: Read, write, organize, move, delete
- **Wikipedia**: Encyclopedia lookup
- **Custom API**: Register custom REST APIs and use them as LLM skills
- **Skill Chaining**: Automatically execute multiple skills in sequence (e.g., search → save to file)

### File Manager
- Browse, create, move, and delete files
- AI-powered automatic file organization
- Protected directory safeguards and two-step delete confirmation

### Browser Automation
- Playwright-based browser automation
- Screenshot → LLM Vision → Action loop (up to 20 steps)
- Automated clicking, typing, scrolling, navigation, and more

### Messenger Integration
- **WhatsApp**: Connect via QR code, auto-reply
- **Telegram**: Connect with API key + QR code, auto-reply
- **Matrix / Element X**: Connect with password or Access Token

### Scheduler
- Schedule tasks for automatic execution
- Notifications via connected messengers

## Setup Guides

| Guide | Description |
|-------|-------------|
| [WhatsApp Setup](docs/whatsapp-setup.md) | Connect WhatsApp via QR code |
| [Telegram Setup](docs/telegram-setup.md) | Get API keys and connect Telegram |
| [Element X Setup](docs/elementx-setup.md) | Connect Matrix / Element X |
| [GitHub LLM Models](docs/github-llm-setup.md) | Use free LLM models via GitHub |

## Installation

### Installer
Download [Sancho Setup 1.0.0.exe](https://github.com/jihan972025/Sancho/releases/download/v1.0.0/Sancho.Setup.1.0.0.exe) — all dependencies are bundled (no separate installation required).


## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| State | Zustand |
| Backend | Python, FastAPI |
| Browser | Playwright |
| Messenger | Baileys (WhatsApp), GramJS (Telegram), matrix-js-sdk (Matrix) |
| Build | PyInstaller, electron-builder (NSIS) |

## License

MIT
