<p align="center">
  <img src="img/android-chrome-192x192.webp" width="120" alt="Sancho Logo">
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
- **Stock & crypto technical analysis** — Get real-time technical analysis for stocks, Bitcoin, Ethereum, and other assets with up-to-date market data.
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
- **14 LLM providers**: OpenAI, Anthropic, Google Gemini, DeepSeek, Grok, Mistral, Perplexity, Qwen, ZhipuAI, Llama (Together AI), GitHub Models, KIMI (Moonshot), NVIDIA NIM, Local LLM (Ollama/LM Studio)
- Real-time SSE streaming responses
- Switch between models freely

### Chat Memory
- Automatically extracts and remembers facts from conversations (name, preferences, instructions)
- Memories persist across sessions in `~/.sancho/memories.json`
- Memory panel (Brain icon) to view, toggle, and delete individual memories
- Injected into system prompt so the AI always knows your context

### Sancho Persona
- Set a custom nickname and role for the AI during onboarding
- Saved to `~/.sancho/SANCHO.md`, always injected into LLM context

### Skill System

28 built-in skills — 20 free (no API key), 8 with API key integration.

#### Built-in Skills (Free)

| # | Skill | Description |
|---|-------|-------------|
| 1 | **duckduckgo** | Web search and news via DuckDuckGo |
| 2 | **wttr** | Real-time weather forecasts (wttr.in) |
| 3 | **yfinance** | Stock prices and market data (Yahoo Finance) |
| 4 | **tradingview** | Technical analysis — RSI, MACD, Bollinger Bands, Moving Averages |
| 5 | **frankfurter** | Foreign exchange rates for 30+ currencies (ECB) |
| 6 | **ccxt** | Real-time cryptocurrency prices from Binance |
| 7 | **wikipedia** | Wikipedia article search and summaries |
| 8 | **gnews** | Google News search (141 countries, 41 languages) |
| 9 | **geopy** | Geocoding — address to coordinates and reverse |
| 10 | **usgs** | Real-time earthquake data (U.S. Geological Survey) |
| 11 | **nagerdate** | Public holidays for 100+ countries |
| 12 | **ipapi** | IP address geolocation (country, city, ISP, timezone) |
| 13 | **timezone** | Timezone and local time lookup for any location |
| 14 | **trivia** | Trivia quiz questions across 24 categories |
| 15 | **pyshorteners** | URL shortening via TinyURL |
| 16 | **restcountries** | Country details — capital, population, languages, borders |
| 17 | **zenquotes** | Random inspirational quotes with author |
| 18 | **filesystem** | File read, write, organize, move, and delete |
| 19 | **info** | Combined country, holiday, timezone, geocode, and IP lookup |
| 20 | **fun** | Combined trivia, quotes, and URL shortener |
| 21 | **krnews** | Korean news headlines via RSS (Yonhap, SBS, Donga, Hankyoreh, etc.) |

#### API Key Required

| # | Skill | Description |
|---|-------|-------------|
| 1 | **tavily** | AI-optimized web search (Tavily API key) |
| 2 | **outlook** | Microsoft Outlook email (Azure AD OAuth) |
| 3 | **gmail** | Gmail email (Google OAuth 2.0) |
| 4 | **google_calendar** | Google Calendar event management (Google OAuth 2.0) |
| 5 | **google_sheets** | Google Sheets read/write (Google OAuth 2.0) |
| 6 | **jira** | Atlassian Jira project management |
| 7 | **confluence** | Atlassian Confluence documentation |
| 8 | **slack** | Slack workspace messaging |

#### Custom API
- Register any REST API as an LLM skill from Settings > API
- **Skill Chaining**: Automatically execute multiple skills in sequence (e.g., search → save to file)

### File Manager
- Browse, create, move, and delete files
- AI-powered automatic file organization
- Protected directory safeguards and two-step delete confirmation

### Browser Automation
- playwright-cli based browser automation (text snapshot + ref-based actions)
- Snapshot → LLM Text → ref-based Action loop (up to 20 steps)
- 48 actions: click, fill, type, drag, select, check, hover, scroll, tabs, cookies, storage, and more

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
| [Gmail Setup](docs/gmail-setup.md) | Connect Gmail via Google OAuth 2.0 |
| [Outlook Setup](docs/outlook-setup.md) | Connect Outlook via Azure AD OAuth 2.0 |
| [Google Calendar Setup](docs/google-calendar-setup.md) | Connect Google Calendar via OAuth 2.0 |
| [Google Sheets Setup](docs/google-sheets-setup.md) | Connect Google Sheets via OAuth 2.0 |

## Installation

### Installer
Download [Sancho Setup 1.0.3.exe](https://github.com/jihan972025/Sancho/releases/download/v1.0.3/Sancho.Setup.1.0.3.exe) — all dependencies are bundled (no separate installation required).


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
