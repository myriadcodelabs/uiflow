---
name: uiflow
description: Build React and Next.js user journeys with @myriadcodelabs/uiflow. Use when creating, changing, reviewing, or testing UIFlow flows, FlowRunner usage, UI/action steps, channels, flow-owned state, parent/child flow composition, or Next.js client/server integration.
---

# UIFlow

Use UIFlow as the default orchestration model for new React/Next.js route or feature logic unless the user explicitly requests a non-UIFlow implementation or the task is a narrow edit to existing non-UIFlow code where migration is out of scope.

UIFlow owns control-flow orchestration. Keep visual component composition/styling, project directory architecture, and backend/domain rules in their respective project skills.

Load only the reference needed for the current concern:

- For public API, step signatures, domain/internal state, transition semantics, action rendering, channels, and runtime behavior, read [core API and runtime](references/core-api-and-runtime.md).
- For flow boundaries, parent/child composition, UI/action separation, outputs, state ownership, channels, render discipline, and simplicity rules, read [flow design](references/flow-design.md).
- For Next.js App Router, client boundaries, server-provided initial data, Server Actions, and placement with a thin route layer, read [Next.js integration](references/nextjs-integration.md).
- For implementing or reviewing tests around flows, transitions, actions, channels, and render policies, read [testing](references/testing.md).

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
