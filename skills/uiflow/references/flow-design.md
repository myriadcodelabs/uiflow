# UIFlow Design Rules

UIFlow should simplify a user journey by making states, transitions, and side effects explicit. Do not turn it into an additional abstraction layer around ordinary local React code.

## One cohesive journey per flow

A flow should model one user journey or cohesive task, not an entire feature area.

Split when:

- steps belong to different domain ownership/invariants;
- a sub-UI is independently stateful or reusable;
- the flow contains distinct modes that rarely share state;
- the flow grows beyond roughly 6–8 meaningful steps and a cohesive child flow can be named.

Prefer parent/child flow composition to a mega-flow. The parent owns high-level orchestration; the child owns localized state and sequencing.

A parent UI step view may render a child `FlowRunner` directly when that child represents a cohesive localized workflow such as editing, creating, confirming, saving, deleting, retrying, modal, or panel behavior. Use channels only when parent/child or sibling flows need explicit cross-flow coordination.

## UI step discipline

Views are declarative adapters:

```text
flow state
  ↓ input(...)
view model
  ↓
view
  ↓ output.emit(intent)
onOutput
  ↓
state mutation + transition
```

Views should:

- render from `input`;
- emit typed user intent;
- keep ordinary visual composition/styling local to React UI concerns.

Views should not:

- select the next flow step;
- perform application fetch/mutation work that belongs to an action step;
- receive the entire flow data object merely for convenience;
- mutate flow state directly.

Use discriminated unions:

```ts
type ReviewOutput =
  | { action: "rate"; rating: Rating }
  | { action: "skip" }
  | { action: "finish" };
```

Keep outputs meaningful. Do not emit a no-op intent whose only consequence is re-rendering unchanged UI.

## Action step discipline

Use action steps for asynchronous/side-effect work that participates in the flow, especially when it affects:

- loading/disabled/error/success UI;
- rendered data;
- navigation/step sequencing;
- shared channel/flow state.

A simple side-effect-only click that needs no flow state/UI transition may remain a direct local handler. Do not create an action step solely because UIFlow exists.

Separate common phases when they clarify the journey:

```text
load → decide → view → commit → next
```

Do not hide several materially different operations inside one opaque action step just to reduce step count.

## Domain vs internal state

Use domain data for caller-owned inputs that define the flow instance, such as route/entity identifiers or server-provided initial domain values.

Use internal data for flow-owned runtime state:

- fetched/transformed working data;
- current selection;
- local workflow flags;
- step-specific error/loading/success information.

Prefer explicit internal UI ownership, for example:

```ts
internal.ui.review.error
internal.ui.review.pendingChoice
```

rather than bloating `FlowRunner.initialData` with flow-internal flags/messages.

## Channels are for flow boundaries

Use channels when independent flows genuinely need to coordinate without prop drilling/global stores.

Typical ownership:

```text
parent client component
  ├── owns stable channel instances
  ├── FlowRunner A
  └── FlowRunner B
```

Do not use a channel:

- to communicate between ordinary components inside one cohesive flow;
- as a substitute for direct local props/handlers;
- merely because multiple steps need the same internal state.

Keep channel instances stable with module scope, `useRef`, or `useMemo` as appropriate. Default to sticky semantics.

## Render discipline

Before adding an output/transition, ask:

> If this interaction did nothing except re-render the same UI, should it be a flow event?

If no meaningful UI/state/side-effect sequencing changes, keep it local.

For slow action steps, explicitly choose whether the UX should:

- render nothing;
- preserve the prior UI;
- show a fallback/busy UI.

Do not assume a loading state appears automatically.

## Simplicity test

Prefer the smallest implementation that keeps the journey understandable.

If removing a channel, wrapper, helper layer, or step leaves behavior and clarity unchanged or improved, remove it.

For new route/feature orchestration, UIFlow remains the default. Exceptions are limited to:

- explicit user request for non-UIFlow implementation;
- narrowly scoped edits to existing non-UIFlow code where migration is outside the request.

When using an exception, state the reason in the completion report.
