# Telegram 연동 사용법

## 1단계: API 키 발급 (1회만)

1. 휴대폰 브라우저에서 https://my.telegram.org 접속
2. Telegram에 등록한 전화번호로 로그인
3. "API development tools" 클릭
4. App 이름(아무거나), 짧은 설명 입력 후 생성
5. API ID (숫자)와 API Hash (영문+숫자) 복사

## 2단계: Sancho 설정

1. start_electron.bat 실행
2. Settings > Chat App 탭
3. Telegram 섹션에서 Enabled 체크
4. API ID 와 API Hash 입력
5. 하단 Save Settings 클릭

## 3단계: QR 코드 연결

1. Connect 버튼 클릭
2. QR 코드가 화면에 나타남
3. 휴대폰 Telegram 앱 > 설정 > 기기 > 데스크톱 기기 연결 > QR 스캔
4. 상태가 Connected로 변경되면 완료

## 4단계: 사용

- Telegram 앱에서 "Saved Messages" (나에게 보내기)로 메시지 전송
- Sancho이 LLM 응답을 채팅창 + Telegram 모두에 전송
- 채팅창에서 Telegram 메시지는 파란색 말풍선으로 표시
