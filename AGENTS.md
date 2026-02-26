# RepGen 에이전트 가이드라인

## 빌드/린트/테스트 명령어
- **개발 서버**: `pnpm dev` (Next.js 개발 서버 시작)
- **빌드**: `pnpm build` (TypeScript 오류는 빌드 설정에서 무시됨)
- **린트**: `pnpm lint`
- **프로덕션 서버**: `pnpm start`
- **테스트 없음**: 이 프로젝트에는 테스트 파일이나 테스트 스크립트가 없습니다

## 코드 스타일

### Import 및 포매팅
- 클라이언트 컴포넌트는 `"use client"` 지시어 사용 (파일 첫 줄)
- React 타입 사용 시 `import type React from "react"` 형식으로 import
- `@/` 경로 별칭 사용: `@/components`, `@/lib/utils`, `@/hooks`
- Import 그룹화 순서: React, 서드파티, 내부 컴포넌트, 아이콘(lucide-react)

### TypeScript 및 타입
- Strict 모드 활성화되어 있지만, next.config.mjs에서 `ignoreBuildErrors: true` 설정됨
- 컴포넌트 Props 타입은 인라인 또는 별도의 `type Props = {...}` 형식으로 정의
- 객체 형태는 `interface`보다 `type` 사용

### 네이밍 규칙
- 컴포넌트: PascalCase + named export (예: `export function TemplateUpload`)
- 파일명: 컴포넌트는 kebab-case (예: `template-upload.tsx`)
- State/변수: camelCase
- 타입: PascalCase

### 에러 처리
- API 호출은 try-catch와 console.error 사용
- 에러 로그는 `[v0]` 접두사 사용: `console.error("[v0] 에러 메시지:", error)`
- 사용자에게 보여줄 에러는 alert 사용: `alert("사용자 친화적 메시지")`

### UI 컴포넌트
- shadcn/ui (new-york 스타일) + Radix UI + Tailwind CSS 기반
- 조건부 클래스는 `@/lib/utils`의 `cn()` 유틸리티 사용
- 아이콘은 Lucide React 사용

## Skills
- `filldoc`: RepGen 템플릿+데이터 채움 기능 구현/수정/디버깅 워크플로우 스킬
  - 경로: `/Users/whyun/workspace/SERVICE/RepGen/.skills/filldoc/SKILL.md`
  - 트리거 예시: 템플릿 업로드/파싱, placeholder 매핑, 미리보기 생성, fill API 검증/에러 처리
