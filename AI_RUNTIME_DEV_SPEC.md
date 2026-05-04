# [Development Spec] Component-based AI Runtime Library for React (AI_RUNTIME_DEV_SPEC)

## 1. 제품 개요 (Product Overview)
본 프로젝트는 프론트엔드 개발자가 AI 백엔드 인프라(Streaming, Auth, Provider 연결)를 직접 구현하지 않고, 표준 React 라이브러리를 사용하는 것처럼 `import` 한 번으로 모든 AI 기능 컴포넌트를 즉시 사용할 수 있게 하는 **"All-in-One AI 컴포넌트 패키지"** 개발을 목표로 합니다.

## 2. 핵심 설계 원칙 (Core Principles)
* **Plug-and-Play**: `@library/react` 패키지를 설치하고 `import` 하는 것만으로 모든 컴포넌트를 즉시 사용 가능해야 합니다.
* **Runtime Agnostic**: UI 컴포넌트는 내부 로직(어댑터)과 분리되어 있어, 어떤 AI 엔진을 사용하더라도 동일한 인터페이스를 유지합니다.
* **Developer Experience (DX)**: 복잡한 설정 없이 `AiProvider` 하나로 모든 하위 컴포넌트의 AI 실행 환경을 제어합니다.

## 3. 시스템 아키텍처 (System Architecture)

### 3.1 어댑터 패턴 기반 유연성 (Universal Model Adapter - UMA)
에이전트는 모든 AI 요청을 처리하는 추상화 계층을 구축해야 합니다.
* **MVP 지원 엔진**:
    * `OpenAIAdapter`: OpenAI API 연동 (SDK 또는 Fetch).
    * `LocalModelAdapter`: Ollama 등 로컬 LLM 인터페이스 연동 (localhost:11434).
* **향후 확장 로드맵**:
    * `API 확장`: OpenRouter, Claude, HuggingFace 등 신규 어댑터 추가 시 UI 코드 수정 불필요.
    * `모달리티 확장`: 텍스트 기반 LLM 외에 비전 모델(이미지 분석), 단순 추론 모델 등으로 확장 가능한 데이터 스키마 설계.

### 3.2 계층 구조
1.  **Component Layer**: 사용자에게 노출되는 UI (예: `<AiChat />`, `<AiSummaryButton />`).
2.  **Hook Layer**: 재사용 가능한 AI 로직 (예: `useAiChat`, `useAiSummary`).
3.  **Execution Layer**: `AiProvider`를 통한 전역 상태 및 어댑터 컨텍스트 관리.
4.  **Adapter Layer**: 각 엔진별 실제 API 호출 및 응답 정규화.

## 4. MVP 기능 명세 및 우선순위
기존 상/중/하 체계에서 개발 및 검증 순서에 따라 1, 2, 3 단계로 세분화하였습니다.

| 우선순위 | 구분 | 기능명 | 상세 내용 |
| :--- | :--- | :--- | :--- |
| **1** | **Provider** | **AiProvider** | `engine`('openai'|'local') 및 환경 설정 주입 |
| **1** | **Component** | **AiChat** | 대화형 인터페이스, 메시지 스트리밍 렌더링 |
| **1** | **Component** | **AiSummaryButton** | 특정 입력값에 대한 요약 결과 팝업/텍스트 출력 |
| **1** | **Hook** | **useAiChat** | 커스텀 채팅 UI 구성을 위한 상태 관리 Hook |
| **2** | **Component** | **AiRewriteButton** | 문장 톤 변경 및 재작성 컴포넌트 |
| **2** | **Component** | **AiFileQaPanel** | 로컬 파일(PDF/TXT) 업로드 및 질의응답 (RAG 기초) |
| **3** | **Vision/Inf** | **Extensibility** | 비전 모델 기반 이미지 분석 및 단순 분류/추론 기능 추가 |

## 5. 기술 스택 (Tech Stack)
* **Language**: **TypeScript** (Strict Type Check 필수)
* **Framework**: **React** (v18+)
* **Async State**: **TanStack Query (React Query)** (스트리밍 응답 및 로딩 상태 관리 최적화)
* **Styling**: **Tailwind CSS** (라이브러리 사용자가 커스터마이징하기 용이한 구조)

## 6. 코딩 에이전트를 위한 가이드라인
1.  **패키지 구조 설계**: `@org/ai-react`와 같은 단일 패키지 구조로 설계하여 `import { AiChat, AiProvider } from '@org/ai-react'`와 같이 사용할 수 있게 하세요.
2.  **인터페이스 통일**: 모든 어댑터는 동일한 `BaseResponse` 타입을 반환해야 합니다.
3.  **스트리밍 처리**: 모든 컴포넌트는 SSE(Server-Sent Events) 및 스트리밍 응답을 자연스럽게 렌더링할 수 있어야 합니다.
4.  **확장성 고려**: 새로운 엔진(예: Claude)이나 새로운 유형의 모델(예: Vision)이 추가될 때 기존 컴포넌트 코드를 건드리지 않고 어댑터만 추가할 수 있는 구조를 유지하세요.

## 7. 예시 코드 (Standard Usage)
```typescript
import { AiProvider, AiChat, AiSummaryButton } from "@your-library/react";

function App() {
  return (
    <AiProvider engine="openai" config={{ apiKey: "sk-..." }}>
      <AiSummaryButton input={someText} />
      <AiChat />
    </AiProvider>
  );
}
```

## 8. 대상 사용자
* React 기반 프론트엔드 개발자 [cite: 61]
* UI는 만들 수 있지만 AI 연동 백엔드에는 익숙하지 않은 개발자 [cite: 61]
* 프로토타입, 데모, 내부 도구를 빠르게 만들고 싶은 팀 또는 1인 개발자 [cite: 61]
* AI가 생성한 프론트 초안을 실제 기능과 빠르게 결합하고 싶은 바이브 코딩 사용자 [cite: 61]

## 9. 차별점
* 기존 SDK와 달리 백엔드 및 runtime 연결을 사용자가 이해할 필요가 없는 구조다. [cite: 61, 62]
* Chat 중심이 아닌 기능형 단위(Summary, Rewrite 등)를 함께 제공한다. [cite: 61, 62]
* 컴포넌트 및 Hook을 동시에 제공하여 초보자와 고급 사용자를 모두 수용한다. [cite: 61, 62]
* 초기부터 Local LLM 대응을 전제로 하여 보안과 비용 효율성을 강조한다. [cite: 61]

## 10. 제외 범위
* 초기 MVP에서 자체 모델 학습 기능은 제공하지 않는다. [cite: 61]
* 초기 MVP에서 범용 no-code 앱 빌더까지 확장하지 않는다. [cite: 61]
* 초기 MVP에서 결제, 팀 협업, 복잡한 워크플로우 빌더는 포함하지 않는다. [cite: 61]

## 11. 성공 기준
* 사용자가 공식 가이드를 따라 10분 내 첫 AI 기능 컴포넌트를 화면에 붙일 수 있다. [cite: 61]
* 기본 예제에서 별도 백엔드 라우트 작성 없이 동작하는 경험을 제공한다. [cite: 61]
* AiChat, AiSummaryButton, AiRewriteButton의 사용성이 충분히 직관적이라는 피드백을 확보한다. [cite: 61]

## 12. 정리
이 제품의 본질은 모델 SDK가 아니라, 프론트엔드 개발자가 AI 기능을 버튼이나 패널처럼 다루게 만드는 "프론트엔드 개발자를 위한 컴포넌트형 AI 런타임 라이브러리"다. [cite: 61]
