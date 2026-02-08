# WhatsApp 연동 사용법

## 1단계: Sancho 설정

1. start_electron.bat 실행
2. Settings > Chat App 탭
3. WhatsApp 섹션에서 Enabled 체크

## 2단계: QR 코드 연결

1. Connect 버튼 클릭
2. QR 코드가 화면에 나타남
3. 휴대폰 WhatsApp 앱 > 설정 > 연결된 기기 > 기기 연결 > QR 스캔
4. 상태가 Connected로 변경되면 완료

## 3단계: 사용

- WhatsApp에서 자기 자신에게 메시지 전송 (나에게 보내기)
- Sancho가 LLM 응답을 채팅창 + WhatsApp 모두에 전송
- 채팅창에서 WhatsApp 메시지는 초록색 말풍선으로 표시

## 참고

- **별도 API 키 불필요**: WhatsApp은 QR 코드만으로 연결됩니다.
- **연결 유지**: 한번 연결하면 세션이 유지되며, 연결이 끊기면 자동 재연결합니다.
- **WhatsApp Web Version**: 연결 시 405 에러가 발생하면 Settings에서 버전 값을 변경해 보세요.
