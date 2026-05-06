# spec/ 인덱스 — `@org/ai-react`

> **한 줄 요약**: 사전 기획 프리뷰 7종. 구현 단계(`_workspace/`)의 입력 초안 역할. **이 폴더는 초안이며, 확정본은 `_workspace/`에서 승격된다.**
>
> 라이브러리 특성상 일반 풀스택 spec과 달리 **DB 없음**, **REST API 표 없음**, **페이지 와이어프레임 없음** — 각 문서가 라이브러리 구조에 맞게 변형되어 있다.

---

## 1. 문서 맵

| # | 파일 | 한 줄 요약 |
|---|------|-----------|
| 1 | [`01_prd.md`](./01_prd.md) | 제품 요구사항 정의서 — P0/P1/P2 사용자 스토리, 수락 기준, NFR, 사용자 여정 |
| 2 | [`02_architecture_preview.md`](./02_architecture_preview.md) | 4계층(Component/Hook/Execution/Adapter) 아키텍처 + 데이터 흐름 + 빌드 토폴로지 |
| 3 | [`03_api_preview.md`](./03_api_preview.md) | Public API(컴포넌트 props·Hook 시그니처) + External API(OpenAI/Ollama 통신 프로토콜) |
| 4 | [`04_db_preview.md`](./04_db_preview.md) | DB 없음 — **내부 데이터 모델 / TypeScript 타입 / 클라이언트 상태 트리 / localStorage 스키마** |
| 5 | [`05_wireframe.md`](./05_wireframe.md) | 컴포넌트별 ASCII 와이어프레임(상태별) + Storybook 카탈로그 구조 |
| 6 | [`06_milestones.md`](./06_milestones.md) | 0.1.0 / 0.2.0 / 1.0.0 npm 릴리즈 로드맵 + 칸반 백로그 |
| 7 | `index.md` | (이 파일) 문서 매핑 + 에이전트별 활용 프로토콜 |

---

## 2. 의사결정 요약 (idea_inquiry.md 확정 사항)

| 항목 | 결정 |
|------|------|
| 보안 모델 | `proxyUrl` 권장 + `dangerouslyAllowBrowser:true` 명시 시 직접 호출 허용. LocalAdapter는 localhost 직접. |
| 패키지 구조 | 단일 패키지 `@org/ai-react`, sideEffects-free, ESM+CJS 듀얼 |
| 빌드 | Vite library mode + `vite-plugin-dts` |
| 스타일링 | Headless + className 슬롯 + data-attribute, `@org/ai-react/preset` 서브패스로 Tailwind preset |
| 상태 영속화 | localStorage 기본 + custom storage adapter plug-in |
| 문서/데모 | Storybook 단독 (인터랙티브 stories + MDX) |
| 첫 릴리즈 | 0.1.0 — P0 6종 + Storybook + npm publish |
| 라이선스 | MIT |
| 핵심 스택 | TypeScript strict, React 18+, TanStack Query, Tailwind preset, Vite |

---

## 3. spec/ ↔ _workspace/ 승격 매핑

| spec/ (초안) | _workspace/ (확정본) | 변환 시 보강 사항 |
|--------------|---------------------|--------------------|
| `01_prd.md` | `_workspace/01_architecture.md`의 "프로젝트 개요/FR/NFR" 섹션 | 일정/담당자 확정, [TBD] 항목 결론 |
| `02_architecture_preview.md` | `_workspace/01_architecture.md`의 "시스템 아키텍처/디렉토리 구조/팀 전달사항" | 디렉토리 트리 final, peerDeps 확정 |
| `03_api_preview.md` | `_workspace/02_api_spec.md` | Public API는 그대로 채택, External API는 어댑터 구현 사양으로 상세화 |
| `04_db_preview.md` | `_workspace/03_db_schema.md` (DB 스키마 표 대신 "내부 데이터 모델" 유지) | 타입 final, schemaVersion 마이그레이션 정책 확정 |
| `05_wireframe.md` | `_workspace/`에 별도 산출물 없음 — Storybook stories(`src/**/*.stories.tsx`)로 직접 구현 | a11y 명세 확정 |
| `06_milestones.md` | `_workspace/05_deploy_guide.md` (npm publish 절차) + `_workspace/04_test_plan.md` | 절대 날짜, CI 시크릿, npm provenance |
| `index.md` | `_workspace/`에는 없음 (구현 단계는 `_workspace/00_input.md`가 대체) | — |

> 주의: 라이브러리이므로 `_workspace/05_deploy_guide.md`는 "서버 배포"가 아니라 **"npm publish 운영 가이드"**로 채워진다.

---

## 4. 에이전트별 활용 프로토콜

### architect (다음 호출에서 `_workspace/` 승격)
1. spec/ 7종 정독 → 일관성·빈틈 점검(architect.md의 Step 2 체크리스트).
2. 통과 시 `_workspace/01_architecture.md`/`02_api_spec.md`/`03_db_schema.md` 확정.
3. [TBD] 항목 중 구현 시작에 차단되는 것은 사용자에게 재질의.

### frontend-dev
- 입력: `01_prd.md`(P0), `03_api_preview.md`(Public API), `05_wireframe.md`(상태별 와이어), `04_db_preview.md`(타입).
- 출력: `src/components/**`, `src/hooks/**`, `src/provider/**`, Storybook stories.
- 주의: 헤드리스 원칙 — 시각 스타일은 preset에서만, 컴포넌트는 className 슬롯 + data-attribute.

### backend-dev
- 이 프로젝트에는 자체 백엔드가 **없다**. 단:
  - 입력: `03_api_preview.md`의 External API 섹션, `02_architecture_preview.md`의 보안 모델.
  - 출력: `src/adapters/**` (OpenAIAdapter, LocalModelAdapter), `src/storage/**`, 정규화 유틸(`parseSSE`, `parseNdjson`).
  - 주의: 어댑터는 React에 무지(無知) — 순수 TS 모듈로 단위테스트 가능해야 함.

### qa-engineer
- 입력: `01_prd.md`(수락 기준·NFR), `03_api_preview.md`(에러 매핑), `05_wireframe.md`(상태 매트릭스).
- 출력: `_workspace/04_test_plan.md`, `**/*.test.ts(x)`, MSW handlers, size-limit 설정.
- 주의: 스트리밍은 MSW로 chunk drip 모킹, 키 없이 통과해야 함.

### devops-engineer
- 입력: `02_architecture_preview.md`(빌드 토폴로지), `06_milestones.md`(릴리즈 일정).
- 출력: `_workspace/05_deploy_guide.md`(npm publish 가이드), GitHub Actions workflows, Storybook 호스팅, `package.json` exports/sideEffects 검증.
- 주의: 인프라 배포가 아니라 **패키지 배포** 파이프라인. provenance 서명 검토.

---

## 5. 미결 항목 일괄 (Open Questions 통합)

| 출처 | 항목 |
|------|------|
| 01_prd | RAG 구현 위치(클라이언트 임베딩 vs 백엔드), 토큰 telemetry 노출, 마크다운 렌더러 내장 |
| 02_arch | TanStack Query peer 강제 여부, AbortController 노출 범위, RSC 호환 가이드 |
| 03_api | Responses API 마이그레이션 시점, 멀티모달 타입 0.1.0 포함 여부, proxy envelope 표준화 |
| 04_db | TokenUsage 영속화, IndexedDB 분리 시점, 멀티 세션 UI |
| 05_wire | 마크다운 렌더러, FileQa 진행률 UI, i18n |
| 06_milestones | 0.1.x 변경 범위, npm provenance/OIDC, 코드오너 |

대부분 **0.x 진행 중 결정**. 차단 항목은 architect가 `_workspace/` 진입 시 재질의.

---

## 6. 다음 단계

1. **사용자 검토**: spec/ 7종을 훑어 의도와 일치하는지 확인.
2. **불일치 시**: architect/idea_miner를 다시 호출해 spec/ 보강.
3. **일치 시**: `/fullstack-webapp` 호출 → architect가 spec/ 검증 후 `_workspace/`로 승격, 이후 frontend-dev / backend-dev(어댑터) / qa-engineer / devops-engineer가 병렬 진행.

---

✅ spec/ 초안 생성 완료. 다음은 `/fullstack-webapp` 호출 시 `_workspace/`로 승격 + 구현 진입.
