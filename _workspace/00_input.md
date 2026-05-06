# 00. 사용자 입력 통합 — `@org/ai-react`

> **한 줄 요약**: React 개발자가 `import` 한 번으로 AI 기능 컴포넌트를 사용하는 npm 패키지(`@org/ai-react`). 백엔드 지식 없이도 동작하지만 production은 proxyUrl 권장.
>
> **상태**: Phase 1 완료, Phase 2 진입 가능.
>
> **참조**: [`../idea.md`](../idea.md) · [`../idea_inquiry.md`](../idea_inquiry.md) · [`../spec/index.md`](../spec/index.md)

---

## 1. 프로젝트 정의

### 1.1 What
React 컴포넌트 라이브러리(npm 패키지). `import { AiProvider, AiChat, AiSummaryButton } from "@org/ai-react"` 한 줄로 AI 기능을 추가.

### 1.2 일반 풀스택 웹앱과 다른 점
이 프로젝트는 **서버를 가지지 않는 라이브러리 패키지**다. `_workspace/` 산출물도 그에 맞게 변형된다:

| 일반 풀스택 | 이 프로젝트 |
|------------|-----------|
| 서버 + DB + 프론트 | npm 패키지 단일 |
| REST 엔드포인트 표 | Public API(props/Hook) + External API(어댑터→OpenAI/Ollama) |
| ERD/RDB 스키마 | 도메인 TypeScript 타입 + React 상태 트리 + localStorage 스키마 |
| 페이지 라우팅 | 컴포넌트 카탈로그(Storybook) |
| 서버 배포 | npm publish + Storybook 호스팅 |

## 2. 기술 스택 (확정)

| 구분 | 기술 | 비고 |
|------|------|-----|
| Language | TypeScript (strict) | 필수 |
| Framework | React 18+ | peerDependency |
| Async/Streaming | TanStack Query v5 | optional peer 검토 |
| Styling | Headless + className 슬롯 + data-attribute | Radix UI 패턴 |
| Tailwind 통합 | `@org/ai-react/preset` 서브패스 export | 별도 import 시 활성화 |
| Build | Vite (library mode) + `vite-plugin-dts` | ESM+CJS 듀얼, sideEffects-free |
| Storage | localStorage 기본 + `StorageAdapter` plug-in | IndexedDB 등 교체 가능 |
| Docs/Demo | Storybook 단독 (인터랙티브 stories + MDX) | 별도 사이트 없음 |
| Test | Vitest + Testing Library + MSW | 어댑터는 순수 TS 단위 테스트 |
| Lint/Format | ESLint + Prettier + size-limit | bundle gzip < 15KB 목표 |
| License | MIT | LICENSE 파일 보유 |

## 3. 핵심 의사결정 (idea_inquiry.md LGTM 결론)

1. **보안 모델**: 기본 `proxyUrl` 권장(BYO backend). `dangerouslyAllowBrowser: true` 명시 시 직접 호출 허용. LocalAdapter는 `localhost:11434` 직접 호출(Ollama CORS는 사용자 책임). README/타입 시스템 양쪽에서 직접 호출 위험 경고.
2. **패키지 구조**: 단일 패키지 `@org/ai-react`, 모든 어댑터 포함. sideEffects: false, ESM+CJS 듀얼 출력.
3. **빌드**: Vite library mode + `vite-plugin-dts`.
4. **스타일링**: Headless 컴포넌트(데이터 속성 기반) + Tailwind preset(`@org/ai-react/preset`) 별도 export.
5. **상태 영속화**: localStorage 기본 + custom `StorageAdapter` plug-in. zero-config UX 우선.
6. **문서/데모**: Storybook 단독.
7. **첫 릴리즈 0.1.0**: P0 6종(AiProvider, AiChat, AiSummaryButton, useAiChat, OpenAIAdapter, LocalModelAdapter) + Storybook + npm publish.
8. **라이선스**: MIT.

## 4. P0 기능 (0.1.0 범위)

| # | 기능 | 종류 |
|---|------|------|
| 1 | `AiProvider` | Component(Context Provider) |
| 2 | `AiChat` | Component(Headless 채팅) |
| 3 | `AiSummaryButton` | Component(요약 버튼+팝오버) |
| 4 | `useAiChat` | Hook(채팅 상태관리) |
| 5 | `OpenAIAdapter` | Adapter(SDK or fetch + SSE) |
| 6 | `LocalModelAdapter` | Adapter(Ollama `/api/chat` NDJSON) |

(P1: AiRewriteButton, AiFileQaPanel — 0.2.0. P2: Vision/추론 확장 — 1.0.0)

## 5. 비기능 요구사항 (spec/01_prd.md NFR)

- 번들 사이즈: gzip < 15KB (코어, 어댑터 트리셰이킹 후 단일 어댑터 기준)
- TTFC(Time to First Chunk): < 1.5s (네트워크 정상 가정)
- 테스트 커버리지: ≥ 80%
- 접근성: WCAG 2.1 AA (키보드 내비게이션, ARIA, focus trap)
- TypeScript: strict 통과 + d.ts 정상 export

## 6. 제외 범위 (Out of Scope)

- 자체 모델 학습/파인튜닝
- no-code 앱 빌더
- 결제/팀 협업/워크플로우 빌더
- 0.1.0에서: Vision 모델, FileQA, RewriteButton, 멀티 세션 UI

## 7. 입력 자료

- `idea.md` — 사용자 작성 상세 아이디어
- `idea_inquiry.md` — Q&A 기반 의사결정 (LGTM)
- `spec/01_prd.md` ~ `spec/06_milestones.md` — 사전 기획 7종
- `spec/index.md` — spec→_workspace 매핑 가이드

## 8. 에이전트 역할 매핑 (라이브러리 특화)

| 에이전트 | 역할 (이 프로젝트) |
|---------|------------------|
| architect | spec/ 검수 → `_workspace/01_architecture.md`, `02_api_spec.md`, `03_db_schema.md` 확정 |
| frontend-dev | `src/components/**`, `src/hooks/**`, `src/provider/**`, Storybook stories |
| backend-dev | `src/adapters/**`, `src/storage/**`, SSE/NDJSON 파서. **서버 없음 — 순수 TS 모듈** |
| qa-engineer | Vitest + MSW + a11y + size-limit + 04_test_plan.md + 06_review_report.md |
| devops-engineer | Vite build 검증, GitHub Actions, npm publish + provenance, Storybook 호스팅. **서버 배포 없음** |

## 9. 다음 단계

1. architect가 spec/ 7종 점검 → `_workspace/01~03` 확정 (또는 spec/ 재작성).
2. architect 통과 시 frontend/backend/devops 병렬 진행.
3. qa가 모두 받아 04_test_plan.md + 06_review_report.md 작성.
