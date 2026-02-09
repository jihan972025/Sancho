# Sancho - AI Agent Desktop App

Windows 10/11용 로컬 AI 에이전트 데스크톱 앱. 다중 LLM 채팅, 파일 관리, 브라우저 자동화 기능 제공.

## 아키텍처

```
Electron + React (Vite + Tailwind)  ← 데스크톱 UI
        │ REST API + SSE
Python FastAPI Backend (port 8765)  ← Electron이 subprocess로 실행
  ├── 10개 LLM Provider
  ├── File Agent (안전장치 포함)
  └── Browser Agent (Playwright)
```

## 실행 방법

```bash
# 개발 실행 (백엔드 + 프론트엔드 + Electron 동시 실행)
start_electron.bat

# 프로덕션 빌드
powershell -ExecutionPolicy Bypass -File build.ps1
```

`start_electron.bat` 하나로 모든 것을 실행/종료:
1. 별도 창에서 Python 백엔드 자동 시작 (port 8765)
2. Vite 개발서버 + Electron 동시 실행
3. Electron 종료 시 백엔드 프로세스도 자동 정리

## 프로젝트 구조

```
sancho/
├── backend/                     # Python FastAPI 백엔드
│   ├── main.py                  # FastAPI 앱 엔트리 (port 8765, CORS)
│   ├── config.py                # AppConfig/LLMConfig (Pydantic, ~/.sancho/config.json)
│   ├── llm/
│   │   ├── base.py              # LLMProvider ABC (complete/stream/vision)
│   │   ├── registry.py          # ALL_PROVIDERS, _PROVIDER_KEY_MAP, 팩토리
│   │   ├── openai_provider.py   # gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
│   │   ├── anthropic_provider.py# claude-sonnet-4-5, claude-haiku-4-5
│   │   ├── gemini_provider.py   # gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro
│   │   ├── zhipuai_provider.py  # glm-4.7, glm-4.6, glm-4.5, glm-4.5-air
│   │   ├── deepseek_provider.py # deepseek-chat, deepseek-reasoner
│   │   ├── grok_provider.py     # grok-2, grok-3, grok-3-mini
│   │   ├── mistral_provider.py  # mistral-large, codestral
│   │   ├── perplexity_provider.py # sonar-pro, sonar-reasoning-pro
│   │   ├── qwen_provider.py     # qwen-max, qwen-plus, qwen-vl-max
│   │   └── llama_provider.py    # Llama-3.3-70B, Llama-3.1-405B (Together AI)
│   ├── api/
│   │   ├── routes_chat.py       # POST /api/chat/send (SSE), /models, /stop
│   │   ├── routes_file.py       # GET/POST/DELETE /api/files/*
│   │   ├── routes_browser.py    # POST /api/browser/start, /agent/run, etc.
│   │   └── routes_settings.py   # GET/PUT /api/settings
│   ├── agents/
│   │   ├── browser_agent.py     # 스크린샷→LLM Vision→행동 루프 (최대 20 스텝)
│   │   └── file_agent.py        # LLM 기반 파일 자동 정리
│   ├── browser/
│   │   └── automation.py        # Playwright 래퍼 (1280x720)
│   └── file_ops/
│       └── manager.py           # 보호 디렉토리, 2단계 삭제 확인 (30초 토큰)
├── src/                         # React 프론트엔드
│   ├── App.tsx                  # 루트 (chat|files|browser|settings 탭)
│   ├── main.tsx                 # React 엔트리
│   ├── index.css                # Tailwind + 전역 스타일
│   ├── types/index.ts           # TypeScript 인터페이스 (Python config 미러링)
│   ├── api/client.ts            # fetch 기반 API 클라이언트 (SSE 스트리밍)
│   ├── stores/
│   │   ├── chatStore.ts         # Zustand: messages, models, streaming
│   │   ├── settingsStore.ts     # Zustand: AppConfig (10개 API 키)
│   │   └── agentStore.ts        # Zustand: browserAgent state, screenshot
│   └── components/
│       ├── Chat/                # ChatWindow, MessageBubble, InputBar
│       ├── FileManager/         # FileExplorer, FileActions
│       ├── Browser/             # BrowserView, ScreenshotView
│       ├── Settings/            # SettingsPanel (10개 프로바이더 키 입력)
│       └── Layout/              # Sidebar, Header
├── electron/
│   ├── main.ts                  # Python subprocess 관리, 개발/프로덕션 분기
│   └── preload.ts               # IPC bridge (contextBridge)
├── package.json                 # Electron + React 의존성
├── requirements.txt             # Python 의존성
├── vite.config.ts               # base: './', alias: @→src
├── tsconfig.json                # strict, paths: @/*→src/*
├── tsconfig.electron.json       # CJS → dist-electron/
├── tailwind.config.mjs          # angel 커스텀 컬러 (blue 테마)
├── postcss.config.mjs           # PostCSS + Tailwind 플러그인
├── start_electron.bat           # 개발 실행 (백엔드+프론트+Electron 동시)
├── electron-builder.yml         # NSIS 인스톨러, extraResources: dist-backend/
└── build.ps1                    # PyInstaller + electron-builder 빌드
```

## LLM 프로바이더 추가 체크리스트

새 프로바이더 추가 시 **6개 파일** 수정:

1. `backend/llm/<name>_provider.py` — `LLMProvider` 구현 (complete/stream/vision)
2. `backend/config.py` — `LLMConfig`에 `<name>_api_key: str = ""` 추가
3. `backend/llm/registry.py` — import + `ALL_PROVIDERS` 리스트 + `_PROVIDER_KEY_MAP` 딕셔너리
4. `src/types/index.ts` — `LLMConfig` 인터페이스에 필드 추가
5. `src/stores/settingsStore.ts` — 기본값에 빈 문자열 추가
6. `src/components/Settings/SettingsPanel.tsx` — `providers` 배열에 항목 추가

OpenAI-compatible API 프로바이더는 `AsyncOpenAI(base_url=...)` 패턴 사용.
Anthropic은 자체 SDK(`anthropic`), Gemini는 `google-genai` SDK 사용.

## API 엔드포인트

| 그룹 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| Chat | POST | `/api/chat/send` | 메시지 전송 (SSE 스트리밍) |
| Chat | GET | `/api/chat/models` | 사용 가능 모델 목록 |
| Chat | POST | `/api/chat/stop` | 생성 중단 |
| Files | GET | `/api/files/list?path=` | 디렉토리 목록 |
| Files | POST | `/api/files/create` | 파일/폴더 생성 |
| Files | DELETE | `/api/files/delete` | 삭제 요청 (토큰 발급) |
| Files | POST | `/api/files/delete/confirm` | 삭제 확인 (토큰 검증) |
| Files | POST | `/api/files/move` | 이동/이름변경 |
| Files | GET | `/api/files/read?path=` | 파일 읽기 (최대 1MB) |
| Files | POST | `/api/files/organize` | AI 기반 정리 |
| Browser | POST | `/api/browser/start` | 브라우저 시작 |
| Browser | POST | `/api/browser/navigate` | URL 이동 |
| Browser | POST | `/api/browser/screenshot` | 스크린샷 (base64 PNG) |
| Browser | POST | `/api/browser/agent/run` | 자동화 태스크 실행 |
| Browser | POST | `/api/browser/agent/stop` | 에이전트 중지 |
| Browser | GET | `/api/browser/agent/status` | 상태 조회 |
| Browser | DELETE | `/api/browser/close` | 브라우저 종료 |
| Settings | GET | `/api/settings` | 설정 조회 |
| Settings | PUT | `/api/settings` | 설정 저장 (프로바이더 캐시 초기화) |
| Health | GET | `/api/health` | 헬스체크 |

## 핵심 패턴

### SSE 스트리밍 (채팅)
- 프론트: `sendMessageStream()` → `EventSource` 파싱 → `chatStore.appendStreamContent()`
- 백엔드: `StreamingResponse` + `provider.stream()` → `data: {"type":"token","content":"..."}`
- 이벤트 타입: `token` | `done` | `error`

### 파일 안전장치
- **보호 디렉토리**: `C:\Windows`, `C:\Program Files`, `C:\ProgramData` 등
- **2단계 삭제**: `request_delete()` → UUID 토큰 발급 (30초 만료) → `confirm_delete(token)`
- **파일 읽기 제한**: 1MB 이하만 허용

### 브라우저 에이전트 워크플로우
```
Screenshot → JS로 클릭 가능 요소 추출 → LLM Vision API →
JSON 응답 {action, params, thought} → Playwright 실행 → 반복 (최대 20회)
```
- 액션: `click(x,y)`, `type(text)`, `scroll`, `navigate`, `press_key`, `wait`, `done`
- 싱글톤: `get_browser_agent()` → 글로벌 `BrowserAgent` 인스턴스

### 설정 관리
- 저장 위치: `~/.sancho/config.json`
- 환경변수 오버라이드: `SANCHO_CONFIG_DIR`
- 설정 변경 시 `reset_providers()` 호출하여 LLM 프로바이더 캐시 초기화

## 코드 컨벤션

- **Python**: async/await, Pydantic 모델, ABC 추상 클래스, logging 모듈
- **TypeScript**: 함수형 컴포넌트 + hooks, Zustand 상태관리, Tailwind 스타일링
- **아이콘**: lucide-react
- **색상 테마**: `angel-50`~`angel-900` (blue 계열, #5c7cfa 기준)
- **포트**: 백엔드 8765, Vite 개발서버 5173

## 빌드/배포

1. `build.ps1` 실행 (PowerShell)
2. PyInstaller: `backend/main.py` → `dist-backend/main.exe`
3. Vite: `src/` → `dist/`
4. electron-builder: NSIS 인스톨러 → `release/Sancho Setup *.exe`
5. `electron-builder.yml`의 `extraResources`로 Python 백엔드 포함
