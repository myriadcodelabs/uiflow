---
name: uiflow
description: Use when creating, refactoring, or reviewing React UI flows with @myriadcodelabs/uiflow. Applies to FlowRunner, defineFlow, createFlowChannel, step transitions, action steps, parent/child flow composition, and channel coordination.
---

# UIFlow Skill

Use `@myriadcodelabs/uiflow` as the default model for new React route or feature logic unless the user explicitly asks for another approach or the task is a narrow edit to existing non-UIFlow code.

## Core Rules

- Import only from package root:

```ts
import { FlowRunner, defineFlow, createFlowChannel, type OutputHandle } from "@myriadcodelabs/uiflow";
```

- Define flow logic with `defineFlow(...)`.
- Render flows with `FlowRunner`.
- Keep user intent in typed `output.emit(...)` events from UI step views.
- Keep transitions and side effects in step definitions.
- `start` must exist in the steps map.
- Every intended transition target must be a valid step key.
- Do not mix `view` and `action` in one step.
- UI step views accept `{ input, output }`.
- UI step views must not transition directly.
- Prefer discriminated output unions over broad `any`.

## Step Types

- UI step: `input`, `view`, `onOutput`.
- Action step: `input`, `action`, `onOutput`, optional `render`.
- Action steps run automatically when current.
- `onOutput` may be sync or async.
- Returning a step name transitions. Returning `void` stays on current step and re-renders.
- Unknown step names are ignored by `FlowRunner`, so generate only valid targets.

## Data

- `initialData` is shallow-copied once into domain data.
- Use `createInternalData()` for flow-owned mutable defaults.
- Mutate domain/internal data inside step logic, not inside view components.
- If a flow has no caller-provided domain input, use `type DomainData = {}` and pass `initialData={{}}`.

## Channels

- Use `createFlowChannel<T>(initial)` for coordination between independent flows.
- Parent components own channel instances and pass them via `eventChannels`.
- Keep channel instances stable with module scope, `useRef`, or `useMemo`.
- Guard access with optional chaining: `events?.channelName`.
- Default to `eventChannelsStrategy="sticky"`.
- Use `"replace"` only when channel replacement semantics are required.
- `channelTransitions` values must be resolver functions, not static strings.

## Composition

- A flow should model one user journey or cohesive task.
- Split flows when steps belong to different domain ownership, UI is reused, flow exceeds about 6-8 steps, or distinct modes rarely share state.
- Prefer parent/child composition when one screen has dense local interactions.
- Parent flow owns screen-level navigation, selection, layout mode, and shared feature state.
- Child flows own localized editing, creating, confirming, saving, deleting, retrying, modal, or panel workflows.
- Parent view components may render child `FlowRunner` instances directly.
- Use channels for cross-flow coordination such as refreshes, selection updates, counters, or shared derived state.

## Render Discipline

- Do not route simple side-effect-only clicks through flow outputs when no UI/state change is needed.
- Use flow outputs and action steps when loading, disabled, error, success, navigation, rendered data, or shared state must change.
- Avoid event buses, helper layers, or channels unless there is a concrete cross-flow or lifecycle need.

## Reference

If present, also read `code_generation_guidelines/uiflow_llm_guidelines.md` in the target project. It is the expanded canonical guide for generated UIFlow code.
