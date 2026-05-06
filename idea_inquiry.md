# Idea Inquiry — 프론트엔드 개발자를 위한 컴포넌트형 AI 런타임 라이브러리 (`@org/ai-react`)

> 최종 업데이트: 2026-05-04
> 상태: ✅ LGTM — 다음 단계 진입 가능

---

## 아이디어 요약

React 개발자가 `import` 한 번으로 AI 기능(Chat, Summary, Rewrite, FileQA 등)을 즉시 붙일 수 있는 **컴포넌트형 AI 런타임 라이브러리**. 어댑터 패턴으로 OpenAI/Local LLM 등 다양한 엔진을 동일한 UI 인터페이스로 추상화한다.

## 해결하려는 문제

- 프론트엔드 개발자가 AI 기능을 붙이려면 매번 백엔드 인프라(스트리밍 SSE, Auth, Provider 어댑팅)를 직접 구현해야 한다.
- AI SDK들은 대부분 "Chat" 중심이라 Summary/Rewrite 같은 **기능형 단위 컴포넌트**가 없다.
- 로컬 LLM(Ollama 등)을 쓰려면 별도 통합 작업이 필요하다.

## 타겟 사용자

- React 기반 프론트엔드 개발자
- UI는 잘 만들지만 AI 백엔드 연동에는 익숙하지 않은 개발자
- 프로토타입/데모/내부 툴을 빠르게 만들고 싶은 팀·1인 개발자
- AI 생성 프론트 초안을 실제 기능과 빠르게 결합하려는 바이브 코더

## 확정된 핵심 기능

| #  | 기능               | 설명                                                 | 우선순위 |
| -- | ------------------ | ---------------------------------------------------- | -------- |
| 1  | `AiProvider`       | engine(`openai`/`local`) 및 환경설정 컨텍스트 주입   | P0       |
| 2  | `AiChat`           | 대화형 인터페이스 + 메시지 스트리밍 렌더링           | P0       |
| 3  | `AiSummaryButton`  | 입력값에 대한 요약 결과 팝업/텍스트 출력             | P0       |
| 4  | `useAiChat`        | 커스텀 채팅 UI를 위한 상태관리 Hook                  | P0       |
| 5  | `OpenAIAdapter`    | OpenAI API 어댑터 (SDK or Fetch)                     | P0       |
| 6  | `LocalModelAdapter`| Ollama 등 로컬 LLM(`localhost:11434`) 어댑터          | P0       |
| 7  | `AiRewriteButton`  | 문장 톤 변경 및 재작성                                | P1       |
| 8  | `AiFileQaPanel`    | 로컬 파일(PDF/TXT) 업로드 + 질의응답 (RAG 기초)       | P1       |
| 9  | Vision/추론 확장   | 비전 모델 기반 이미지 분석 / 단순 분류·추론           | P2       |

**핵심 엔티티(명사)**: `Adapter`, `Engine`, `Message`, `StreamChunk`, `BaseResponse`, `ChatSession`, `Document`(FileQA용)

**역할 모델**: 라이브러리 자체는 프론트엔드 패키지라 권한 모델 없음. 단, "라이브러리 사용자(개발자)" vs "라이브러리 사용자가 만든 앱의 최종 사용자" 두 층위가 존재.

## 의사결정 결론

- [x] **API 키/보안 모델** → **(C) 둘 다 지원** — 기본은 `proxyUrl` 백엔드 프록시 권장(production-safe), `dangerouslyAllowBrowser: true` 명시 시 브라우저 직접 호출 허용(개발/내부 도구용). LocalModelAdapter는 `localhost:11434` 직접 호출(CORS는 Ollama 측 설정 안내). README/타입 시스템 양쪽에서 직접 호출의 위험성을 경고한다.
- [x] **패키지 구조** → **단일 패키지** `@org/ai-react`, 모든 어댑터 포함. **트리셰이킹**을 위해 sideEffects-free + ESM 우선 빌드.
- [x] **빌드 도구체인** → **Vite (library mode)**. ESM + CJS 듀얼 출력, `vite-plugin-dts`로 `.d.ts` 생성.
- [x] **스타일링 정책** → **(B) Headless/Unstyled + Tailwind preset 별도 제공**. 내부 컴포넌트는 className 슬롯 + data-attribute 기반 styling hook 패턴(Radix UI 스타일). `@org/ai-react/preset` 서브패스로 Tailwind preset export.
- [x] **상태 영속화** → **localStorage 기본 + custom storage adapter plug-in**. zero-config(설치만 하면 채팅 히스토리 보존), `storage` prop으로 IndexedDB/외부 스토어 교체 가능. "백엔드 지식 없는 프론트 개발자가 최소한의 코드로 동작 경험"이라는 핵심 가치에 부합.
- [x] **데모·문서 사이트** → **Storybook 단독**. 컴포넌트 라이브러리에 가장 자연스럽고 추가 도구체인 부담 최소화. 각 컴포넌트마다 인터랙티브 stories + MDX 사용 가이드 동시 제공.
- [x] **첫 릴리즈 목표** → **0.1.0**: P0 6종(`AiProvider`, `AiChat`, `AiSummaryButton`, `useAiChat`, `OpenAIAdapter`, `LocalModelAdapter`) + Storybook 문서 + npm publish.
- [x] **라이선스** → **MIT** (가장 채택 장벽이 낮음, 차후 변경 가능).
- [ ] **에러·재시도 정책** — P0 구현 중 결정, 기본 정책: 네트워크 실패 시 단순 throw + onError 콜백, rate limit은 어댑터 단에서 exponential backoff 1회 재시도.
- [ ] **AiFileQaPanel RAG 구현 위치** — P1 단계에서 결정 (클라이언트 임베딩 검토).
- [ ] **Vision 모델** — P2.

## Claude의 질문

> 우선순위 높은 5개부터 답변 부탁드립니다. 답변 주신 만큼만 반영해 다시 정리합니다.

**Q1. API 키와 보안 모델은 어떻게 가져갈까요?**
세 가지 후보가 있습니다:
- (A) 브라우저에서 직접 OpenAI 호출 허용 (개발/내부 도구 한정, README에 보안 경고)
- (B) 백엔드 프록시를 권장하고 라이브러리에 `proxyUrl` 설정 표준 제공 (BYO backend)
- (C) 둘 다 지원 — `engine="openai"`는 직접, `engine="proxy"` 별도 어댑터 추가
→ (답변 대기 중)
- 답변: 세 가지 후보 중 가장 효율적이고 보안상 안전한 방식으로 선택해줘.

**Q2. 패키지 구조와 빌드 정책은?**
- (A) 단일 패키지 `@org/ai-react`에 모든 어댑터 포함 (트리셰이킹 의존)
- (B) 코어 + 어댑터 분리 (`@org/ai-react`, `@org/ai-react-openai`, `@org/ai-react-local`) — 모노레포(pnpm workspace + turbo) 전제
- 빌드 도구: tsup / vite-lib / rollup 중 선호?
→ (답변 대기 중)
- 답변: 단일 패키지로 할거고, 빌드 도구는 vite로 해줘.

**Q3. 스타일링과 커스터마이징 방향은?**
- (A) Tailwind 의존 (사용자도 Tailwind 사용 전제, `tailwind.config`에 preset 제공)
- (B) Headless/Unstyled 옵션 + Tailwind preset을 별도 제공 (Radix UI 패턴)
- (C) CSS-in-JS 토큰 시스템 (vanilla-extract, css variables)
→ (답변 대기 중)
- 답변: (B) 로 해줘.

**Q4. 채팅 히스토리/상태 영속화는?**
- (A) 메모리-only (stateless, refresh 시 초기화)
- (B) localStorage 기본 + custom storage adapter plug-in
- (C) 영속화는 사용자 책임 — `messages` prop을 외부에서 통제 (controlled 패턴)
→ (답변 대기 중)
- 답변: 이 패키지는 프론트엔드 개발자가 백엔드 구성이나 관련 지식은 아예 없어도 최소한으로 ai 기능을 추가할 수 있도록 하는거야. 거기에 부합하도록 알아서 구성해줘.

**Q5. 데모/문서 사이트와 첫 릴리즈 형태는?**
- 문서: Storybook 단독 / Docusaurus / Nextra / Astro Starlight 중 선호?
- 데모: 별도 Next.js 앱 / Storybook stories만 / CodeSandbox 임베드?
- 첫 릴리즈 목표: 0.1.0에 P0 6개(AiProvider, AiChat, AiSummaryButton, useAiChat, OpenAIAdapter, LocalModelAdapter)만 포함하고 npm publish가 목표인지?
→ (답변 대기 중)
- 일단은 기본적인 릴리즈 목표는 이대로 해주고, 나머지 내용은 잘 모르겠어. 알아서 해주길 바래.

## 사용자 답변 요약

- **Q1 (보안)**: "가장 효율적이고 보안상 안전한 방식으로" → 프록시 권장을 기본으로 두되 직접 호출도 명시적 opt-in으로 지원하는 (C) 채택. 라이브러리 핵심 가치(zero-backend로도 동작)와 production 보안을 모두 만족시키는 균형점.
- **Q2 (패키지/빌드)**: 단일 패키지 + Vite library mode.
- **Q3 (스타일링)**: (B) Headless + Tailwind preset 별도 제공.
- **Q4 (상태 영속화)**: "프론트엔드 개발자가 백엔드 지식 없이도 최소한의 코드로 AI 기능 추가" → localStorage 기본 + plug-in adapter (zero-config UX 우선).
- **Q5 (문서/릴리즈)**: 기본 릴리즈 목표(P0 6종 + npm publish) 유지, 문서/데모 형태는 Storybook 단독으로 결정.

## 구현 가능성 판단

- **현재 정보로 설계 시작 가능한 부분**:
  - 어댑터 인터페이스 (`Adapter`, `BaseResponse`, `StreamChunk` 타입)
  - `AiProvider` Context 구조
  - P0 컴포넌트 6종의 외부 API(props) 시그니처
  - SSE 스트리밍 처리 로직 (TanStack Query 기반)
  - TypeScript strict 설정, React 18+ 의존성

- **설계 전에 반드시 확인해야 할 부분**:
  - Q1 (보안 모델) — 어댑터 구조와 README/예제 코드 방향이 모두 바뀜
  - Q2 (패키지 구조) — 모노레포 채택 여부가 디렉토리 구조 결정
  - Q3 (스타일링) — 컴포넌트 구현 방식이 근본적으로 달라짐

- **나중에 결정해도 되는 부분**:
  - AiFileQaPanel RAG 구현 (P1 단계)
  - Vision 어댑터 (P2)
  - 라이선스 텍스트 (릴리즈 직전 결정 가능)
  - 자세한 에러/재시도 정책 (P0 구현 중 자연스럽게 윤곽 잡힘)

---

✅ LGTM! 아이디어가 충분히 구체화되었습니다. `/spec_check`로 사전 설계 문서를 생성하거나, `/fullstack-webapp`으로 바로 구현을 시작할 수 있습니다.
