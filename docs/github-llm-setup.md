# GitHub LLM 모델 연결 사용법

GitHub Models는 GitHub 계정만 있으면 무료로 다양한 AI 모델을 사용할 수 있는 서비스입니다.

## 1단계: GitHub Personal Access Token 발급

1. https://github.com/settings/tokens 접속 (GitHub 로그인 필요)
2. "Generate new token" > "Generate new token (classic)" 클릭
3. Note: `Sancho` (또는 아무 이름)
4. Expiration: 원하는 기간 선택
5. 권한(scope)은 아무것도 체크하지 않아도 됩니다
6. "Generate token" 클릭
7. 생성된 토큰 복사 (`ghp_` 로 시작하는 문자열)

## 2단계: Sancho 설정

1. Settings > LLM Models 탭
2. GitHub Copilot 섹션에 API Key 입력 (`ghp_...`)
3. Save Settings 클릭

## 3단계: 모델 추가

1. Settings > LLM Models 탭 하단의 모델 추가 영역에서
2. Provider: `github` 선택
3. Model ID 입력 (아래 사용 가능 모델 참고)
4. Add 클릭

## 사용 가능한 모델 (예시)

| Model ID | 설명 |
|----------|------|
| `gpt-4o` | OpenAI GPT-4o |
| `gpt-4o-mini` | OpenAI GPT-4o Mini |
| `o3-mini` | OpenAI o3-mini |
| `Phi-4` | Microsoft Phi-4 |
| `Mistral-large` | Mistral Large |
| `DeepSeek-R1` | DeepSeek R1 |

전체 모델 목록: https://github.com/marketplace/models

## 참고

- **무료 사용**: GitHub 계정이 있으면 무료로 사용 가능 (일일 요청 제한 있음)
- **API 엔드포인트**: `https://models.inference.ai.azure.com` (자동 설정됨)
- **토큰 만료**: 토큰이 만료되면 GitHub에서 새로 발급 후 교체
