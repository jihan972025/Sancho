<p align="center">
  <img src="img/apple-touch-icon.png" width="120" alt="Sancho Logo">
</p>

<h1 align="center">Sancho</h1>

<p align="center">
  <b>AI Agent Desktop App for Windows</b><br>
  Multi-LLM Chat &bull; File Management &bull; Browser Automation &bull; Messenger Integration
</p>

---

## Overview

Sancho는 Windows 10/11용 로컬 AI 에이전트 데스크톱 앱입니다. 다양한 LLM 프로바이더와 연동하여 채팅, 파일 관리, 브라우저 자동화, 메신저 통합 기능을 제공합니다.

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
- **10+ LLM 프로바이더 지원**: OpenAI, Anthropic, Google Gemini, DeepSeek, Grok, Mistral, Perplexity, Qwen, ZhipuAI, Llama (Together AI), GitHub Models
- SSE 스트리밍 응답
- 모델 간 자유로운 전환

### Skill System
- **웹 검색**: DuckDuckGo, Tavily
- **파일 관리**: 읽기, 쓰기, 정리, 이동, 삭제
- **Wikipedia**: 백과사전 검색
- **Custom API**: 사용자 정의 REST API 등록 및 LLM 스킬로 활용
- **Skill Chaining**: 여러 스킬을 순차적으로 자동 실행 (예: 검색 → 파일 저장)

### File Manager
- 파일 탐색, 생성, 이동, 삭제
- AI 기반 파일 자동 정리
- 보호 디렉토리 안전장치, 2단계 삭제 확인

### Browser Automation
- Playwright 기반 브라우저 자동화
- Screenshot → LLM Vision → Action 루프 (최대 20 스텝)
- 클릭, 입력, 스크롤, 네비게이션 등 자동 수행

### Messenger Integration
- **WhatsApp**: QR 코드로 연결, 자동 응답
- **Telegram**: API 키 + QR 코드 연결, 자동 응답
- **Matrix / Element X**: 비밀번호 또는 Access Token 연결

### Scheduler
- 예약 작업 설정 및 자동 실행
- 메신저를 통한 알림

## Setup Guides

| Guide | Description |
|-------|-------------|
| [WhatsApp 연결](docs/whatsapp-setup.md) | QR 코드로 WhatsApp 연동 |
| [Telegram 연결](docs/telegram-setup.md) | API 키 발급 및 Telegram 연동 |
| [Element X 연결](docs/elementx-setup.md) | Matrix / Element X 연동 |
| [GitHub LLM 모델](docs/github-llm-setup.md) | GitHub Models 무료 LLM 연결 |

## Installation

### Installer
`Sancho Setup x.x.x.exe` 실행 — 모든 의존성 포함 (별도 설치 불필요)

### Development
```bash
# Backend + Frontend + Electron 동시 실행
start_electron.bat
```

### Production Build
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

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
