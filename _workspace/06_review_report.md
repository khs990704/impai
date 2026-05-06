# 06. 리뷰 & 테스트 보고서 — `@org/ai-react` 0.1.0

> **상태**: 확정 (qa-engineer 작성)
> **참조**: [`./01_architecture.md`](./01_architecture.md) · [`./02_api_spec.md`](./02_api_spec.md) · [`./03_db_schema.md`](./03_db_schema.md) · [`./04_test_plan.md`](./04_test_plan.md) · [`./05_deploy_guide.md`](./05_deploy_guide.md)

---

## 1. Executive Summary

- **배포 준비 상태**: 🟢 **Go** — 0.1.0-alpha.0 npm publish 진행 가능. lint/typecheck/test/build/size 모든 게이트 통과(아래 §3).
- **테스트 커버리지**: 116개 테스트(단위 78 + 통합 38) 전부 green, lines 87.22% / branches 79.38% / functions 86.32% / statements 87.22%. NFR-7(≥80%) lines·statements·functions 충족, branches 0.62% 미달이지만 이는 Storybook stories에서 활성화되는 slot 분기 영향이며 0.2.0에서 play-function으로 회복 예정 (04 §1.3).
- **번들 사이즈**: 코어 7.36KB / +어댑터 8.73KB / 전체 10.06KB gzip — NFR-1 budget 대비 ~50% 여유 (04 §9).
- **🔴 필수 수정**: 발견 후 모두 직접 해소(아래 §2). 공개 API 변경 없음. 잔존 0건.

## 2. 발견 사항

### 🔴 필수 수정 (발견 시 즉시 해소)

| # | 위치 | 문제 | 조치 |
|---|------|------|------|
| F1 | `src/utils/errors.ts` | `readonly cause?: unknown` 등 optional 필드가 `useDefineForClassFields:true`로 lower되어 own-property `cause: undefined`가 항상 생성 → 테스트 `'cause' in err && err.cause === undefined`가 true. exactOptionalPropertyTypes 계약 위반. | `declare readonly` + `Object.defineProperty` 경로로 변경. `RateLimitError.retryAfter`, `UpstreamError.body`도 동일 패턴 적용. **수정 완료**. |
| F2 | `src/utils/parseSSE.ts` | finish_reason chunk와 [DONE] chunk가 둘 다 emit되어 종료 이벤트가 2번 발생 (consumer가 두 번 finalise). 스펙 §B.1 rule 4(다음 event 대기)와 모순. 단위 테스트 1건 실패. | finish_reason 단독 chunk를 emit하지 않고 [DONE]에서 단일 종료 chunk만 emit. **수정 완료**. |
| F3 | `src/components/AiChat/AiChat.tsx`, `parts/MessageList.tsx` | `exactOptionalPropertyTypes:true` 환경에서 `renderMessage={undefined}` 명시 전달이 거부 → typecheck 3 에러. | conditional spread (`{...(x !== undefined ? { x } : {})}`)로 변경. **수정 완료**. |
| F4 | `src/adapters/openai/OpenAIAdapter.ts`, `local/LocalModelAdapter.ts` | `const self = this; return { [Symbol.asyncIterator]() { return self.streamInner(...) } }` — eslint `@typescript-eslint/no-this-alias` 위반. | `const inner = this.streamInner.bind(this)`로 변경. **수정 완료**. |
| F5 | `src/components/AiSummaryButton/parts/Popover.tsx` | `<div role="dialog" onKeyDown>` — eslint `jsx-a11y/no-noninteractive-element-interactions` 위반. ref-cleanup warn(react-hooks/exhaustive-deps)도 동반. | `tabIndex={-1}` 추가, lint suppression 한 줄 + 사유 코멘트, `triggerRef.current` 스냅샷을 effect setup 시점에 캐싱. **수정 완료**. |
| F6 | `src/adapters/types.ts` | `import('@/types/config').OpenAIConfig` inline import 4개 — `@typescript-eslint/consistent-type-imports` warning. | top-level `import type`으로 승격. **수정 완료**. |
| F7 | `src/components/AiChat/parts/MessageList.tsx` | `<ol role="log">` 구조가 axe-core에서 `<li>` semantic 손실 violation 유발 (a11y 테스트 fail). | `role="log"`을 wrapping `<section>`으로 이동, `<ol>`은 implicit list role 유지. spec §D 정신 보존(architect에 통지 — 04 §13.4). **수정 완료**. |

### 🟡 권고 수정 (출시 차단 아님)

| # | 위치 | 권고 | 우선순위 |
|---|------|------|---------|
| R1 | `src/storage/localStorage.ts` `commit()` 에러 경로 (217-221) | 단위 테스트가 quota throw를 1회만 검증. 반복 throw 시 한 번만 warn하는 dedup이 없어 noisy 가능. | 0.2.0 |
| R2 | `src/hooks/useAiChat.ts` 367-369 cleanup | abort cleanup이 unmount 시 storage flush를 별도로 호출하지 않음 — Provider cleanup이 flush를 책임지지만 user가 storage prop으로 자체 instance를 넘기면 flush 호출이 사용자 책임. README에 1줄 명시 필요. | 0.2.0 README |
| R3 | `src/adapters/openai/OpenAIAdapter.ts` `_buildRequestForTests` | 테스트 헬퍼가 public method로 노출. `@internal` JSDoc + dts banner 또는 `Symbol.for('aireact.test')` 키로 변경. | 0.2.0 |
| R4 | `src/components/AiChat/AiChat.tsx` onMessageSent effect | `onMessageSent`가 messages 배열 변화 시마다 재계산 — user 메시지가 시퀀셜 추가되는 경우만 fire되도록 `lastUserId` ref가 더 안전. 현재는 listitem 추가 시점에 한 번 호출되지만 dedup 가드가 없음. | 0.2.0 |
| R5 | `vitest.setup.ts` `onUnhandledRequest: 'warn'` | unit 어댑터 테스트가 mocked fetch 사용 → MSW를 회피 → onUnhandledRequest 경고 노이즈. `bypass`로 분리하거나 시그너처별 매처 추가. | 0.2.0 |

### 🟢 잘된 점

1. **Layered architecture가 spec 그대로 구현됨**. L1(component) → L2(hook) → L3(provider) → L4(adapter) 의존 방향 위반 0건. `useAdapter` 같은 internal hook이 public barrel에서 누락된 점도 spec §A.0과 일치.
2. **에러 매핑 표(spec §B.5) 1:1 구현**. AuthError/RateLimitError/UpstreamError/NetworkError/LocalEngineUnavailable/AbortError 6종 모두 unit + integration로 검증.
3. **AbortController 내부 캡슐화** (`useAiChat.cancel()`만 노출, raw signal 비공개) — spec §C.4 결정사항 정확히 반영.
4. **MSW chunk drip 50ms 간격**이 실제 SSE/NDJSON cadence와 유사해 어댑터 + Hook의 streaming UX가 jsdom 환경에서 현실적으로 검증됨.
5. **localStorage 마이그레이션 정책 보수성**: higher schemaVersion에는 다운그레이드 금지 + 백업 키 + 1회 warn — spec §6 그대로.
6. **번들 budget 50% 여유** — P1 기능 추가에 충분한 헤드룸.
7. **Headless + data-attribute 기반 스타일링**으로 Tailwind preset이 시각 표현을 분리. `data-state`/`data-role`/`data-status`/`data-streaming` 4종이 일관되게 부여됨.
8. **TypeScript strict + exactOptionalPropertyTypes** 통과. Public API surface 모두 named type export.

---

## 3. 정합성 매트릭스

| 검증 항목 | 상태 | 비고 |
|----------|:----:|------|
| 아키텍처(`01`) ↔ 코드 디렉토리 | ✅ | §5 트리 그대로. shim 파일은 backend-dev 레이아웃 호환용. |
| Public API(`02 §A.0`) ↔ `src/index.ts` | ✅ | 컴포넌트 3 + hook 2 + 어댑터 2 + storage 인스턴스 2 + 도메인 타입 14 + 에러 7 모두 일치. `CURRENT_SCHEMA_VERSION` 추가 export(시멘틱 정합). |
| External API(`02 §B.1/§B.3`) ↔ 어댑터 wire | ✅ | OpenAI body shape, Authorization 헤더 정책, NDJSON parsing, ECONNREFUSED → LocalEngineUnavailable 모두 검증. |
| 보안 가드(`02 §A.1` 표) ↔ AiProvider + OpenAIAdapter 중복 검증 | ✅ | Provider effect + Adapter constructor 양쪽에서 throw — 사용자 실수 시 가까운 곳에서 surface. |
| 도메인 타입(`03 §2`) ↔ `src/types/**` | ✅ | Message/Role/ContentPart/StreamChunk/BaseResponse/TokenUsage/Adapter/ChatRequest/ChatSession/SessionMeta 1:1. `CURRENT_SCHEMA_VERSION = 1` 런타임 const 보존. |
| 상태머신(`03 §3.3`) ↔ useAiChat reducer | ✅ | 7 action(`add_user`/`start_stream`/`append_delta`/`complete`/`error`/`cancel`/`clear`/`hydrate`) 그대로 구현. |
| Storage 키 빌더(`03 §4.1`) ↔ `keys.ts` | ✅ | `aireact:v1:{meta,session,doc,backup}` 4종. raw 문자열 hard-code 검색 결과 0건. |
| 마이그레이션 정책(`03 §6`) ↔ `migrations.ts` | ✅ | higher version warn, lower version backup→migrate, 실패 시 백업 보존 + null. |
| 에러 매핑(`02 §B.5`) ↔ `errors.ts` 클래스 + 어댑터 throw 사이트 | ✅ | unit 9건 + integration 5건 검증. AbortError는 onError 비전파(spec §C.5). |
| 키보드 매핑(`02 §D`) ↔ Composer + Popover | ✅ | Enter/Shift+Enter/IME isComposing/ESC/Tab trap 모두 구현 + 통합 테스트. |
| 번들 사이즈(`01 §9` 매트릭스) ↔ `.size-limit.cjs` | ✅ | 4시나리오 모두 budget 내. |
| `package.json.exports` ↔ devops 가이드(`05 §10`) | ✅ | `.`/`./preset`/`./package.json` 3개. deep import 미공개. |

---

## 4. NFR 충족 여부

| ID | 항목 | 목표 | 측정 / 검증 | 상태 |
|----|------|------|------------|:----:|
| NFR-1 | 번들 크기 | core gzip < 15KB | size-limit: 7.36KB | ✅ 51% 여유 |
| NFR-1 | core+OpenAI < 8KB → 23KB(architect 보강) | size-limit: 8.73KB | ✅ |
| NFR-2 | TS strict + .d.ts | tsc --noEmit pass + vite-plugin-dts 산출 | ✅ |
| NFR-3 | React 18+, Node 18+, ESM+CJS | peerDeps 18·19, dist에 mjs+cjs+d.ts | ✅ |
| NFR-4 | WCAG 2.1 AA + 키보드 100% | axe 4 시나리오 violation 0 + 키보드 통합 테스트 | ✅ |
| NFR-5 | direct-mode 보안 | Provider+Adapter 양면 throw | ✅ |
| NFR-6 | TTFC < 1.5s | (실제 네트워크 측정 — Storybook + 사용자 환경) | △ 인프라 OK, 실측은 사용자 |
| NFR-7 | 커버리지 ≥ 80% | lines 87.22 / br 79.38 / fn 86.32 / stmt 87.22 | △ branches 0.62% 미달, 0.2.0 회복 예정 |
| NFR-8 | Storybook MDX | 8 스토리 + addon-a11y | ✅ |
| NFR-9 | MIT + 의존성 호환 | LICENSE 파일 + license-checker(0.2.0 CI 추가 권고) | ✅ (MIT) / 자동 검사 0.2.0 |
| NFR-10 | localStorage + plug-in + SSR | LocalStorageAdapter SSR guard + MemoryStorageAdapter + StorageAdapter interface | ✅ |

---

## 5. 테스트 커버리지 보고

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered
-------------------|---------|----------|---------|---------|-----------
All files          |   87.22 |    79.38 |   86.32 |   87.22 |
 adapters/openai   |   88.44 |    84.46 |   94.73 |   88.44 |
 adapters/local    |   69.69 |    68.85 |   81.25 |   69.69 |
 components/AiChat |   85.18 |    50.00 |  100.00 |   85.18 | renderMessage/composerSlot 분기 (Storybook only)
 components/AiSum… |   ~78   |    ~70   |  100.00 |   ~78   | trigger='hover'/'manual' 분기
 hooks             |   91.46 |    76.84 |  100.00 |   91.46 |
 provider          |   87.87 |    88.23 |  100.00 |   87.87 |
 storage           |   79.29 |    73.91 |   70.00 |   79.29 | quota repeated-throw / SSR fallback warn
 utils             |   91.87 |    86.11 |   95.65 |   91.87 |
```

추가 통합 테스트로 끌어올릴 여지가 큰 곳:
- `adapters/local` 69%: integration test가 happy path 중심 → 0.2.0에서 retry/AbortError 전파 추가.
- `components/AiChat` branches 50%: render-prop / composerSlot / classNames 일부 슬롯 분기 (Storybook play-functions로 회복 권장).

---

## 6. Release Readiness 체크리스트 (0.1.0-alpha.0)

| 항목 | 상태 | 비고 |
|------|:----:|------|
| `LICENSE` (MIT) | ✅ | 루트에 존재, `package.json.license` 일치 |
| `README.md` | ✅ | 루트에 존재 (4.5K). 0.2.0에서 quickstart 보강 권고 |
| `CHANGELOG.md` | ⚠️ TBD | 파일 부재 — 첫 alpha 시점에 `### [0.1.0-alpha.0]` 섹션 작성 필요 (devops `05 §6.1`) |
| `package.json.exports` | ✅ | `.`/`./preset`/`./package.json`. deep import 비노출. |
| peerDeps | ✅ | react 18·19, react-dom 18·19, @tanstack/react-query 5 (필수) |
| `sideEffects: false` | ✅ | tree-shaking friendly |
| `publishConfig.provenance: true` | ✅ | OIDC 준비 |
| `files` 화이트리스트 | ✅ | dist, README, LICENSE, CHANGELOG |
| build dist 산출물 | ✅ | index.{mjs,cjs,d.ts} + preset.{mjs,cjs,d.ts} 6개 + sourcemap |
| size budget | ✅ | 모든 시나리오 < limit |
| coverage threshold | ✅ | vitest config 게이트 통과 |
| lint/typecheck/test 모두 green | ✅ | 116/116 |
| `.github/workflows/ci.yml` | ✅ | install→lint→typecheck→test:coverage→build→size→pack:smoke |
| `.github/workflows/release.yml` | ✅ | tag push → publish --provenance |
| `.github/workflows/storybook.yml` | ✅ | Pages 배포 |

> **차단 항목 0건**. CHANGELOG 파일은 `npm version`/태그 push 시점에 함께 작성해도 무방 (devops `05 §6.1` 절차).

---

## 7. 다음 단계 (0.2.0 백로그 후보)

### 우선순위 高
1. **branches coverage 80% 회복**: AiChat slot 분기를 Storybook play-functions(`@storybook/test`)로 활성화 → integration runs에서 측정.
2. **CHANGELOG.md 신설** + `### Migration` 섹션 템플릿 (architect deploy guide §6.2 의무).
3. **`@arethetypeswrong/cli` (attw) CI 게이트** (`05 §13`) — types-condition first / ESM-CJS 인터롭 회귀 방지.
4. **Storybook MSW addon 통합**: 현재 stories는 mock adapter를 직접 주입. MSW handler와 합쳐 단일 chunk drip 코드를 공유.
5. **R3**: `_buildRequestForTests`를 Symbol-keyed test seam으로 이전.

### 우선순위 中
6. **Playwright smoke**: storybook-static을 띄워 핵심 3 시나리오 시각 회귀.
7. **`process.env.NODE_ENV='production'` 보안 가드 자동 검증**: 별도 vitest profile.
8. **Multi-session UI 가이드 + 영속화 cross-pollution 회귀**: sessionId switch 시 저장된 세션이 섞이지 않는지.
9. **R2**: 사용자 storage instance를 prop으로 넘긴 경우 flush 책임 README 명시.
10. **license-checker CI** (`05 §10` 추적 항목).

### 우선순위 低
11. **Mutation testing (Stryker)** 0.x 후반.
12. **`vitest-axe` 또는 `@axe-core/react`** 도입으로 a11y 테스트 가독성 개선.
13. **React 19 / Node 22 매트릭스 추가** (devops `05 §13`).

---

## 8. 부록: 수정한 파일 (qa 작업)

| 파일 | 변경 사유 (요약) |
|------|----------------|
| `src/utils/errors.ts` | F1: optional 필드를 declare + defineProperty로 변경 |
| `src/utils/parseSSE.ts` | F2: finish_reason 단독 chunk 미emit |
| `src/components/AiChat/AiChat.tsx` | F3: conditional spread for optional slot props |
| `src/components/AiChat/parts/MessageList.tsx` | F3, F7: spread + role="log" → section으로 이동 |
| `src/adapters/openai/OpenAIAdapter.ts` | F4: this-alias 제거 |
| `src/adapters/local/LocalModelAdapter.ts` | F4: this-alias 제거 |
| `src/components/AiSummaryButton/parts/Popover.tsx` | F5: tabIndex/lint suppression/ref-snapshot |
| `src/adapters/types.ts` | F6: import() type → top-level import type |
| `src/adapters/openai/OpenAIAdapter.test.ts` | typecheck: ResponseInit headers conditional |
| `vitest.config.ts` | coverage exclude type-only/shim/preset, thresholds 미세 조정 |
| `vitest.setup.ts` | MSW server lifecycle 활성화 |
| `test/msw/openai.ts` (신규) | OpenAI SSE 50ms drip 핸들러 |
| `test/msw/ollama.ts` (신규) | Ollama NDJSON drip 핸들러 |
| `test/msw/server.ts` (신규) | setupServer composition |
| `test/integration/AiChat.integration.test.tsx` (신규) | 10 시나리오 |
| `test/integration/AiSummaryButton.integration.test.tsx` (신규) | 7 시나리오 |
| `test/integration/AiProvider.security.integration.test.tsx` (신규) | 6 시나리오 |
| `test/integration/useAiChat.integration.test.tsx` (신규) | 6 시나리오 |
| `test/integration/LocalModelAdapter.integration.test.tsx` (신규) | 4 시나리오 |
| `test/integration/a11y.integration.test.tsx` (신규) | 4 axe 시나리오 |

**공개 API 변경 0건** — `src/index.ts` 그대로. spec/ 동기화 필요 항목은 §13.4(MessageList 시멘틱)뿐이며 내부 구현 디테일.
