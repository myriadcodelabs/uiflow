# UIFlow LLM Guidelines

This document is the canonical guide for code agents generating UI flow code with `@myriadcodelabs/uiflow` in this repo.

## 1) What UIFlow is

UIFlow is a code-first flow runner for React.

You define:
- named steps in a plain object
- a required `start` step
- transitions by returning the next step name from `onOutput`

Two step types are supported:
- UI step: `input + view + onOutput`
- Action step: `input + action + onOutput` (optional `render` policy)

## 2) Import rules

Always import from package root:

```ts
import { FlowRunner, defineFlow, createFlowChannel, type OutputHandle } from "@myriadcodelabs/uiflow";
```

Never import from `dist/*` in app code.

## 3) API surface (what agents may rely on)

### `createFlowChannel<T>(initial: T)`
Creates a shared channel object:
- `get(): T`
- `emit(update: T | ((prev: T) => T)): void`
- `subscribe(listener): unsubscribe`

### `defineFlow(steps, { start })`
- Throws if `start` is missing or not present in `steps`.
- Supports optional `channelTransitions` map (`channel key -> transition`).
- Each transition is a resolver function returning `nextStep | void` (sync or async) with context `{ data, currentStep, events, channelKey }`.
- Supports optional `createInitialData()` for flow-local defaults.
- Supports optional `normalizeInitialData(data)` to normalize either caller-provided or flow-created initial data.
- Returns `{ steps, start, channelTransitions?, createInitialData?, normalizeInitialData? }`.

### `FlowRunner`

```tsx
<FlowRunner flow={flowDef} initialData={initialData} eventChannels={channels} />
```

Props:
- `flow`: result of `defineFlow`
- `initialData` (optional): mutable shared data for this flow instance
- `eventChannels` (optional): shared channels
- `eventChannelsStrategy` (optional): `"sticky"` (default) or `"replace"`

## 4) Runtime semantics from `dist/flow.js`

These details are required for correct generated code.

1. Action step detection is runtime-based: a step is treated as action if `step.action && !step.view`.
2. Action steps run automatically when they become current.
3. UI steps render the `view`, and outputs are sent through `output.emit(...)`.
4. `onOutput` can be sync or async for both step types.
5. `FlowRunner` resolves channels using `eventChannelsStrategy` before subscribing.
6. With `"sticky"` (default), first-seen channel instance per key is retained across parent re-renders.
7. With `"replace"`, latest incoming channel instances are used.
8. Equivalent channel maps are deduplicated to avoid unnecessary re-subscription churn.
9. Any channel `emit` triggers FlowRunner re-render.
10. If `channelTransitions[channelKey]` is configured, channel `emit` evaluates resolver and transitions only when a valid step is returned.
11. Resolver functions can inspect channel state via `events?.[channelKey]?.get()` to apply conditional logic.
12. `initialData` is shallow-copied once at initialization (`data: { ...initialData }`).
13. Data is mutable inside steps; transitions force re-render by cloning `data` reference.
14. If `onOutput` returns an unknown step name or `void`, FlowRunner stays on current step and re-renders.
15. Step errors are logged (`console.error`) and not rethrown.
16. Channel transition resolver errors are logged (`console.error`) and runner falls back to re-rendering current step.
17. Action steps render `null` by default while busy.
18. Action steps can optionally configure `render`:
  - `mode: "preserve-previous"` keeps previous UI step rendered while action runs.
  - `mode: "fallback"` renders provided fallback view while action runs.
19. Flow initialization order is:
  - use `FlowRunner.initialData` when provided; otherwise use `flow.createInitialData()` when available.
  - throw when neither source exists.
  - apply `flow.normalizeInitialData(...)` when defined.

## 5) Hard constraints for generated code

1. `start` must exist in the steps map.
2. Every intended transition target must be a valid step key.
3. Do not mix `view` and `action` in one step.
4. UI components for UI steps must accept `{ input, output }`.
5. UI components must call `output.emit(...)`, never transition directly.
6. Keep transition logic inside `onOutput`, not inside view components.
7. Prefer strict output unions (discriminated unions), not broad `any`.
8. Guard channel access with optional chaining: `events?.channelName`.
9. Keep channel instances stable across renders.
10. Use `eventChannelsStrategy="replace"` only when you intentionally want channel instance replacement semantics.

## 6) Channel lifecycle pattern (important)

FlowRunner normalizes/deduplicates channel maps internally, so app code can stay simple.
Use `"sticky"` for orchestration-first flows; use `"replace"` for explicit channel replacement semantics.

Preferred patterns:
- module scope singleton channel when appropriate
- `useRef` or `useMemo` in client component for per-instance channels

Good:

```tsx
"use client";

import { useMemo } from "react";
import { createFlowChannel, FlowRunner } from "@myriadcodelabs/uiflow";

export function Screen() {
  const studiedCounter = useMemo(() => createFlowChannel(0), []);
  const channels = useMemo(() => ({ studiedCounter }), [studiedCounter]);

  return <FlowRunner flow={flow} initialData={initialData} eventChannels={channels} />;
}
```

Avoid:

```tsx
const studiedCounter = createFlowChannel(0); // inside render, recreated each render
<FlowRunner eventChannels={{ studiedCounter }} eventChannelsStrategy="replace" ... />
```

## 7) Reference architecture from flashcards

Use the same separation of concerns as:
- `src/app/flashcards/flows/studyFlashCard.tsx`
- `src/app/flashcards/_client_components/FlashCardView.tsx`

Pattern:
1. Flow owns mutable state and transitions.
2. `input` maps flow state into a view model.
3. View renders from `input` and emits user intent via typed `output.emit(...)`.
4. Action step performs side effects (fetch/mutation).
5. `onOutput` mutates flow data and returns next step.

Cross-flow communication pattern:
- One flow emits to channel (`events?.studiedCounter.emit(...)`).
- Another flow reads channel in `input` (`events?.studiedCounter.get()`).

## 8) Output typing pattern

Use discriminated unions:

```ts
type StudyOutput =
  | { action: "flip"; cardId: string }
  | { action: "rate"; cardId: string; rating: Rating }
  | { action: "next"; cardId: string };
```

Then type the view:

```ts
type Props = {
  input: StudyInput;
  output: OutputHandle<StudyOutput>;
};
```

## 9) Step template to follow

```ts
import { defineFlow } from "@myriadcodelabs/uiflow";

type Data = {
  deckId: string;
  cards: CardState[];
  activeCardId: string | null;
};

export const flow = defineFlow<Data>(
  {
    fetchCards: {
      input: (data) => ({ deckId: data.deckId }),
      action: async ({ deckId }, data) => {
        const cards = await fetchCardsAction(deckId);
        data.cards = cards ?? [];
        data.activeCardId = null;
        return { ok: true };
      },
      onOutput: () => "study",
    },

    study: {
      input: (data) => ({ cards: data.cards, activeCardId: data.activeCardId }),
      view: StudyView,
      onOutput: (data, output, events) => {
        if (output.action === "flip") {
          data.activeCardId = output.cardId;
          return "study";
        }
        if (output.action === "next") {
          events?.studiedCounter.emit((n: number) => n + 1);
          return "fetchCards";
        }
      },
    },
  },
  { start: "fetchCards" }
);
```

## 10) Next.js guidance

- Add `"use client"` to UI step view files.
- `FlowRunner` usage belongs in client components.
- Server actions can be called inside action steps, as in flashcards.

## 11) Common mistakes to reject

1. Importing from `@myriadcodelabs/uiflow/dist/*` in app code.
2. Using `output.done(...)` (correct method is `output.emit(...)`).
3. Returning nonexistent step names.
4. Putting application data fetch/mutation logic directly in UI views.
5. Creating channels every render without memoization/ref.
6. Picking the wrong strategy (`"replace"` vs `"sticky"`) for your channel lifecycle needs.
7. Expecting deep reactivity on `initialData` prop changes.
8. Emitting flow outputs for no-op intents that do not change visible UI or meaningful flow state.
9. Introducing extra orchestration layers (event buses/channels/wrappers) when a direct local handler is sufficient.
10. Using static string values in `channelTransitions` (must be resolver functions).
11. Assuming action steps auto-render a loading placeholder by default.

## 12) Generation checklist for agents

When asked to implement a new flow, produce:

1. Typed flow data model.
2. Typed output unions for each UI step.
3. `defineFlow(...)` with valid `start` and valid transition targets.
4. UI step components with `{ input, output }` contract.
5. `FlowRunner` entry component with stable `eventChannels` (if channels are needed).
6. No placeholders, no pseudocode, and no internal-path imports.
7. No no-op transitions: each emitted output must either update rendered UI, update meaningful state, or trigger a required side-effect represented in state.

## 13) Minimum quality bar

Generated code must:
- compile in TypeScript
- keep flow logic centralized in step definitions
- keep view components declarative and dumb
- avoid runtime channel/reference pitfalls described above

## 14) Default Policy (Mandatory)

For all new route or feature logic, code agents MUST use UIFlow as the default implementation model, regardless of UI or logic complexity.

Required baseline for new implementations:
- define flow logic with `defineFlow(...)`
- render via `FlowRunner`
- keep user intent in typed `output.emit(...)` events from UI step views
- keep transitions and side effects in flow steps

Allowed exceptions (only):
- the user explicitly requests a non-UIFlow implementation for the task
- the task is a narrowly scoped edit to existing non-UIFlow code where migration is out of scope for that request

If an exception is used, the agent must state the reason explicitly in its response.

## 15) Render Discipline (Mandatory)

Goal:
- Trigger flow transitions and FlowRunner re-renders only when there is a user-visible UI change or a meaningful flow-state change required for UX.

Rules:
- Do not route simple side-effect-only clicks through flow outputs when no UI/state update is needed.
- For side-effect-only actions with no required state transition, execute the side effect without introducing a flow transition.
- Use flow outputs and action steps when at least one of these is true:
  - UI loading/disabled/error/success state must be shown
  - rendered data changes
  - navigation/step transition is required
  - shared flow/channel state must change

Decision test before adding an output transition:
- If this click did nothing except re-render the same UI, do not emit a flow output for it.

## 16) Simplicity First (Mandatory)

Goal:
- Use UIFlow to simplify control flow, not to add abstraction overhead.

Rules:
- Prefer the smallest implementation that satisfies requirements and remains readable.
- Do not add channels, event buses, or helper layers unless there is a concrete need (cross-flow coordination, shared subscriptions, replacement semantics, or lifecycle ownership requirements).
- Keep action/UI flags localized inside flow-managed state (prefer step-scoped `ui` state such as `data.ui.<stepName>.*`) rather than extending `FlowRunner` with app-specific flags/messages.
- Do not require callers to pass step UI flags/messages via `FlowRunner.initialData`; define defaults in `defineFlow` using `createInitialData()` (and optional `normalizeInitialData(...)`), then maintain flags through step logic.
- If a local UI handler can perform a non-stateful side effect safely, prefer that over extra orchestration.
- Reuse established simple patterns already present in the codebase unless there is a documented reason to diverge.

Decision test:
- If removing an added layer keeps behavior and clarity the same or better, that layer should not exist.
