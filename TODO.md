# TODO

## 🚀 우선순위 높음 (High Priority)

### 루프 기능 완전 지원
- [ ] **루프 플레이스홀더 추출** (`extract-placeholders/route.ts`)
  - `{#array}...{/array}` 패턴 감지
  - 배열 타입 플레이스홀더 구조 파악
  - 중첩 루프 지원
  
- [ ] **AI 프롬프트 개선** (`fill-placeholders/route.ts`)
  - 배열 데이터 생성 가이드 추가
  - 배열 예시 포함
  - 중첩 객체 처리

### API 키 관리 개선
- [ ] Grok API 키 검증 로직 확인
  - `xai-`로 시작하는지 확인
  - 실제 API 호출로 유효성 검증

## 📝 우선순위 중간 (Medium Priority)

### UI/UX 개선
- [ ] **배열 플레이스홀더 표시**
  - PlaceholderList에서 루프 플레이스홀더 구분 표시
  - `{#array}` 형식을 배지나 아이콘으로 표시
  
- [ ] **배열 데이터 편집 인터페이스**
  - ContentEditor에 테이블 형식 편집기 추가
  - 행 추가/삭제 기능
  - JSON 직접 편집 모드

- [ ] **에러 메시지 개선**
  - 더 구체적인 오류 메시지
  - 해결 방법 제시
  - Toast 알림 활용

## 📚 문서화 (Documentation)

- [ ] **README.md 업데이트**
  - 루프 기능 사용법 섹션 추가
  - Word 표 작성 예시 추가
  - 중첩 루프 예시 추가
  
- [ ] **예제 템플릿 제공**
  - 샘플 Word 템플릿 파일 생성 (`examples/` 폴더)
  - 기본 플레이스홀더 예제
  - 루프 플레이스홀더 예제
  - 표 형식 예제
  
- [ ] **API 문서화**
  - 각 API 엔드포인트 설명
  - 요청/응답 형식
  - 에러 코드 정의

## 💡 향후 개선사항 (Future Enhancements)

### 기능 추가
- [ ] 템플릿 미리보기 기능
- [ ] 생성 히스토리 관리
- [ ] 여러 템플릿 저장/불러오기
- [ ] AI 모델 선택 UI 개선
- [ ] 실시간 협업 기능

### 기술 개선
- [ ] 테스트 코드 작성
  - 단위 테스트
  - 통합 테스트
  - E2E 테스트
  
- [ ] 성능 최적화
  - 큰 파일 처리 개선
  - 스트리밍 응답 UI 표시
  - 캐싱 전략
  
- [ ] 보안 강화
  - API 키 암호화
  - Rate limiting
  - Input validation

### 배포
- [ ] Vercel 배포 설정
- [ ] 환경 변수 관리
- [ ] CI/CD 파이프라인
- [ ] Docker 컨테이너화

## 🐛 알려진 이슈 (Known Issues)

- [ ] Word 파일 바이너리 읽기 → 텍스트 추출 개선 필요
- [ ] AI 응답에서 `{{key}}` 형식으로 반환되는 경우 있음 (정규화로 해결됨)
- [ ] Grok API 키 형식 검증 필요

## ✅ 완료됨 (Completed)

- [x] 플레이스홀더 `{{keyword:description}}` 형식 지원
- [x] Description을 AI 프롬프트에 반영
- [x] 다중 파일 업로드 기능
- [x] Drag & Drop 지원
- [x] Word 파일 텍스트 추출 API
- [x] API 키 실시간 검증
- [x] Toast 알림 추가
- [x] GPT-4o 모델 적용
- [x] Grok-4 모델 적용
- [x] streamText API 사용
- [x] nodemon 개발 환경 설정
- [x] README.md 작성
- [x] AGENTS.md 작성

## 📌 참고사항

### 루프 기능 현황
- ✅ docxtemplater의 `paragraphLoop: true` 설정됨
- ✅ 루프 렌더링 기능 작동 중
- ⏳ 루프 추출 및 AI 생성 개선 필요

### AI 모델
- OpenAI: `gpt-4o`
- xAI: `grok-4` (최신 reasoning 모델)

---

**마지막 업데이트**: 2024-11-13
