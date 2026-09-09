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
- Each transition is a resolver function returning `nextStep | void` (sync or async) with context `{ domain, internal, currentStep, events, channelKey }`.
- Supports optional `createInternalData()` for flow-owned internal defaults.
- Returns `{ steps, start, channelTransitions?, createInternalData? }`.

### `FlowRunner`

```tsx
<FlowRunner flow={flowDef} initialData={initialData} eventChannels={channels} />
```

Props:
- `flow`: result of `defineFlow`
- `initialData`: domain data for this flow instance
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
12. `initialData` is shallow-copied once at initialization as domain data.
13. Internal data is initialized from `createInternalData()` when provided; otherwise `{}`.
14. Domain/internal data are mutable inside steps; transitions force re-render by cloning both references.
15. If `onOutput` returns an unknown step name or `void`, FlowRunner stays on current step and re-renders.
16. Step errors are logged (`console.error`) and not rethrown.
17. Channel transition resolver errors are logged (`console.error`) and runner falls back to re-rendering current step.
18. Action steps render `null` by default while busy.
19. Action steps can optionally configure `render`:
  - `mode: "preserve-previous"` keeps previous UI step rendered while action runs.
  - `mode: "fallback"` renders provided fallback view while action runs.
20. Flow initialization order is:
  - `FlowRunner.initialData` initializes domain data.
  - `createInternalData()` initializes internal data when defined; otherwise internal data starts as `{}`.

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

## 8) Flow boundaries and composition (Mandatory)

Goal:
- Keep qualifying flows cohesive, readable, and maintainable by splitting when structure or ownership diverges.

Rules:
- A flow should model one user journey or cohesive task, not an entire feature area.
- Split flows when steps belong to different domain ownership or invariants.
- Split flows when UI is reused across routes or features.
- Split flows when the flow exceeds ~6–8 meaningful steps or contains distinct modes that rarely share state.
- Use parent/child flow composition when both the parent and localized child have genuine orchestration responsibilities.
- Parent flow may own higher-level navigation, selection, layout mode, or shared feature sequencing.
- Child flow may own a localized multi-state sequence such as edit → save → retry/success, creation wizard steps, or confirm → execute → result.
- Do not create child flows for ordinary local UI state such as open/close, field values, selected tabs, or other direct component interactions.
- Nested `FlowRunner` usage inside a parent step's React component is valid when the nested workflow independently qualifies for UIFlow; it is not a requirement for every complex-looking screen.
- Avoid mega-flows that mix unrelated responsibilities, but do not replace a mega-flow with many ceremonial child flows that have no meaningful transition graph.

Default refactoring behavior:
- When refactoring an existing large flow, identify screen-level transitions versus localized interaction loops.
- Extract a child flow only when the localized interaction itself has meaningful phases, branching, async sequencing, retries/errors, or independent lifecycle/state ownership.
- Keep simple local interactions as ordinary React inside the parent view.

Heuristic:
- If an intent changes a meaningful screen/journey mode, it is a strong flow candidate.
- If an intent belongs to a local region and has its own meaningful loading/error/confirmation/continuation sequence, it may be a child flow.
- If an intent is just local component state, keep it local.

## 9) Cross-flow communication via channels (Mandatory)

Goal:
- Coordinate state/events between independent flows without prop drilling or global stores.

Rules:
- Use channels only when multiple flows genuinely need to coordinate or share reactive state/events.
- The parent component owns channel instances and passes them via `eventChannels`.
- Child flows access channels via `events?.channelName.get()` and emit via `events?.channelName.emit(...)`.
- Default to `eventChannelsStrategy="sticky"` unless replacement semantics are explicitly required.

Nested flow composition pattern:
- Parent view components may render child `FlowRunner` instances directly.
- Pass only the child flow's required `initialData`; do not mirror the entire parent flow state into every child by default.
- Use channels for real cross-flow coordination such as list refresh, selected item updates, counters, or shared derived state.
- Prefer direct props/handlers when the communication is ordinary component composition rather than flow-to-flow coordination.

## 10) Output typing pattern

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

## 11) Step template to follow

```ts
import { defineFlow } from "@myriadcodelabs/uiflow";

type DomainData = {
  deckId: string;
};

type InternalData = {
  cards: CardState[];
  activeCardId: string | null;
};

export const flow = defineFlow<DomainData, InternalData>(
  {
    fetchCards: {
      input: (domain) => ({ deckId: domain.deckId }),
      action: async ({ deckId }, _domain, internal) => {
        const cards = await fetchCardsAction(deckId);
        internal.cards = cards ?? [];
        internal.activeCardId = null;
        return { ok: true };
      },
      onOutput: () => "study",
    },

    study: {
      input: (_domain, internal) => ({
        cards: internal.cards,
        activeCardId: internal.activeCardId,
      }),
      view: StudyView,
      onOutput: (_domain, internal, output, events) => {
        if (output.action === "flip") {
          internal.activeCardId = output.cardId;
          return "study";
        }
        if (output.action === "next") {
          events?.studiedCounter.emit((n: number) => n + 1);
          return "fetchCards";
        }
      },
    },
  },
  {
    start: "fetchCards",
    createInternalData: () => ({
      cards: [],
      activeCardId: null,
    }),
  }
);
```

## 12) Next.js guidance

- Add `"use client"` to UI step view files.
- `FlowRunner` usage belongs in client components.
- Server actions can be called inside action steps, as in flashcards.
- Do not move a Server Component or otherwise server-renderable route into a UIFlow client boundary unless the interaction actually qualifies for UIFlow.

## 13) Common mistakes to reject

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
12. Wrapping simple local React state in UIFlow without a meaningful transition/sequence problem.

## 14) Generation checklist for agents

When UIFlow is warranted and the agent is asked to implement a new flow, produce:

1. Typed flow data model.
2. Typed output unions for each UI step.
3. `defineFlow(...)` with valid `start` and valid transition targets.
4. UI step components with `{ input, output }` contract.
5. `FlowRunner` entry component with stable `eventChannels` only if channels are needed.
6. No placeholders, no pseudocode, and no internal-path imports.
7. No no-op transitions: each emitted output must either update rendered UI, update meaningful state, or trigger a required side-effect represented in state.

No-domain-input pattern:
- If a flow has no caller-provided domain input, use `type DomainData = {}` and pass `initialData={{}}` to `FlowRunner`.

## 15) Minimum quality bar

Generated UIFlow code must:
- compile in TypeScript
- keep flow logic centralized in step definitions
- keep view components declarative and dumb
- avoid runtime channel/reference pitfalls described above
- be simpler or clearer than the equivalent plain React control flow it replaces

## 16) Applicability Policy (Mandatory)

UIFlow is the default orchestration model for React/Next.js interactions that have a meaningful control-flow problem. It is not mandatory for every route, feature, component, form, or event handler.

Use UIFlow when at least one material orchestration need exists:
- multiple meaningful phases or named UI modes form a journey
- user intent branches into different next states
- async work participates in visible loading, retry, error, success, or continuation sequencing
- several transitions share mutable journey state and would otherwise be scattered across handlers/effects
- independent child/sibling flows require explicit coordination
- local `useState`/`useEffect` control flow is becoming difficult to understand because behavior is distributed

Prefer plain React/Next.js when behavior is local and direct:
- static or server-rendered content with no client journey
- simple field/input state
- open/close, selected tab, accordion, hover, disclosure, or similar isolated UI state
- direct click/navigation/side-effect handlers with no meaningful state sequence
- simple forms whose existing framework/local submit/pending/error model is already clear
- straightforward data display/fetching without meaningful client-side orchestration
- any case where named steps and `FlowRunner` merely rename simple state instead of clarifying behavior

Decision test before introducing UIFlow:
- If plain React/Next.js is shorter and equally explicit, do not use UIFlow.
- If named states/transitions materially clarify sequencing, branching, side effects, or coordination, use UIFlow.

Existing non-UIFlow code does not need migration merely because UIFlow is installed. Migrate when the requested work exposes an orchestration problem UIFlow would materially simplify, or when the user explicitly requests migration.

## 17) Render Discipline (Mandatory)

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

## 18) Simplicity First (Mandatory)

Goal:
- Use UIFlow to simplify control flow, not to add abstraction overhead.

Rules:
- First decide whether UIFlow itself is warranted using Section 16.
- Prefer the smallest implementation that satisfies requirements and remains readable.
- Do not add channels, event buses, child flows, or helper layers unless there is a concrete need.
- Keep action/UI flags localized inside flow internal state (prefer step-scoped `ui` state such as `internal.ui.<stepName>.*`) rather than extending `FlowRunner` with app-specific flags/messages.
- Do not require callers to pass step UI flags/messages via `FlowRunner.initialData`; define defaults in `defineFlow` using `createInternalData()`, then maintain flags through step logic.
- If a local UI handler can perform a simple interaction safely and clearly, prefer that over extra orchestration.
- Reuse established simple patterns already present in the codebase unless there is a documented reason to diverge.

Decision tests:
- If removing UIFlow entirely keeps behavior equally clear with less code, UIFlow should not be used.
- Once UIFlow is justified, if removing an added channel, child flow, wrapper, helper, or step keeps behavior and clarity the same or better, that added layer should not exist.
