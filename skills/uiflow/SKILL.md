---
name: uiflow
description: Build React and Next.js user journeys with @myriadcodelabs/uiflow when interaction has meaningful orchestration such as multiple UI phases, branching transitions, async sequencing, retries/errors, or coordination between independent flows. Do not use for ordinary local component state or simple interactions where plain React/Next.js is clearer.
---

# UIFlow

Use UIFlow when a React/Next.js interaction has a real control-flow problem to model. UIFlow is the default orchestration model for qualifying multi-state or multi-step journeys; it is not the default for every route, component, form, or click handler.

Prefer plain React/Next.js when local state and direct handlers express the behavior with less code and equal or better clarity.

UIFlow owns control-flow orchestration. Keep visual component composition/styling, project directory architecture, and backend/domain rules in their respective project skills.

Load only the reference needed for the current concern:

- For public API, step signatures, domain/internal state, transition semantics, action rendering, channels, and runtime behavior, read [core API and runtime](references/core-api-and-runtime.md).
- For deciding whether UIFlow is warranted, flow boundaries, parent/child composition, UI/action separation, outputs, state ownership, channels, render discipline, and simplicity rules, read [flow design](references/flow-design.md).
- For Next.js App Router, client boundaries, server-provided initial data, Server Actions, and placement with a thin route layer, read [Next.js integration](references/nextjs-integration.md).
- For implementing or reviewing tests around flows, transitions, actions, channels, and render policies, read [testing](references/testing.md).

## Applicability

Use UIFlow when at least one material orchestration need exists, such as:

- a journey has multiple meaningful phases or named UI modes;
- user intent branches into different next states;
- async work participates in visible loading, retry, error, success, or continuation sequencing;
- several transitions share mutable journey state and would otherwise be scattered across handlers/effects;
- independent child/sibling workflows need explicit coordination;
- the interaction is already becoming difficult to understand as local `useState`/`useEffect` control flow.

Do not use UIFlow merely because the application uses React/Next.js or the library is available. Prefer ordinary React/Next.js for:

- static or server-rendered content with no client journey;
- simple input/local component state;
- open/close, selected tab, accordion, hover, disclosure, or similar isolated UI state;
- a direct click/navigation/side effect with no meaningful state sequence;
- a simple form whose submit/pending/error behavior remains clearer in its existing framework/local form model;
- data display/fetching that has no meaningful client-side orchestration;
- cases where introducing named steps and `FlowRunner` only renames straightforward local state without clarifying behavior.

Decision test: if plain React/Next.js is shorter and equally explicit about the behavior, do not introduce UIFlow. If named states/transitions materially clarify sequencing, branching, side effects, or coordination, use UIFlow.

## Core policy

- Import only from `@myriadcodelabs/uiflow`; never import package internals or `dist/*`.
- Define flows with `defineFlow<DomainData, InternalData>(...)` when the flow owns internal state.
- `DomainData` is caller-provided data supplied through `FlowRunner.initialData`.
- `InternalData` is flow-owned state initialized with `createInternalData()`.
- UI steps use `input + view + onOutput`.
- Action steps use `input + action + onOutput` and may define `render`.
- Never combine `view` and `action` in one step.
- Views render from `input` and emit typed user intent with `output.emit(...)`; they do not choose transitions.
- Keep transitions in `onOutput` and asynchronous flow work in action steps.
- Mutating domain/internal flow data inside step handlers is supported and intentional.
- Every intended transition must name an existing step.
- Use discriminated unions for UI outputs; avoid `any` in application flow code.
- Use channels only when independent flows genuinely need shared reactive state/events. Keep channel instances stable.
- Prefer small cohesive flows. Split unrelated responsibilities instead of building mega-flows; parent flows may render child `FlowRunner` instances for localized workflows.
- Do not introduce an output/transition merely to re-render identical UI or perform a side effect that needs no flow-state/UI change.

## Source authority

When working on this library repository itself, current `src/flow.tsx` and tests under `test/flow-runner/` are authoritative for runtime behavior. `code_generation_guidelines/uiflow_llm_guidelines.md` is the canonical generation policy. Do not infer current behavior from stale examples when source/tests disagree.

When using the published package in another application, use the installed package version and its bundled UIFlow guidelines as authority rather than assuming this repository's newest source matches that installed version.
