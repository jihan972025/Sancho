# Element X (Matrix) 연동 사용법

## 기본 설정

1. Settings > Chat App > Matrix / Element > Enabled 체크
2. Homeserver URL: `https://matrix.org` (또는 사용 중인 서버)
3. User ID: `@사용자이름:matrix.org`
4. Password: Element X 계정 비밀번호
5. Save Settings > Connect 클릭
6. 다른 사용자가 Matrix DM을 보내면 AngelBot이 LLM 응답
7. 채팅창에서 보라색 말풍선으로 표시

## Gmail SSO로 가입한 경우

Gmail SSO로 가입하면 비밀번호 없이 로그인됩니다. Access Token을 직접 가져오면 됩니다.

### Access Token 가져오는 방법

1. PC 브라우저에서 https://app.element.io 접속
2. "Sign in with Google" 로 같은 Gmail 계정으로 로그인
3. 로그인 후 좌측 상단 프로필 아이콘 클릭 > "All settings"
4. "Help & About" 탭 클릭
5. 하단 "Advanced" 섹션 펼치기
6. "Access Token" 옆의 값 복사 (`syt_` 로 시작하는 긴 문자열)

### Sancho 설정

- Homeserver URL: `https://matrix.org`
- User ID: `@사용자이름:matrix.org` (Element X 프로필에서 확인)
- Password: 비워두기
- Access Token: 위에서 복사한 토큰 붙여넣기
- Save Settings > Connect

## 대화방 만들기

Element X 앱에서 초대자 없이 보안 없는 방을 만들면 됩니다.
