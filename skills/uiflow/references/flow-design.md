# UIFlow Design Rules

UIFlow should simplify a user journey by making meaningful states, transitions, and side effects explicit. Do not turn it into an additional abstraction layer around ordinary local React code.

## Applicability first

Before designing a flow, decide whether the interaction actually needs orchestration.

Use UIFlow when at least one material orchestration need exists:

- multiple meaningful UI phases or modes form a journey;
- user intent branches into different next states;
- asynchronous work participates in visible loading, retry, error, success, or continuation sequencing;
- several transitions share mutable journey state and would otherwise be scattered across handlers/effects;
- independent flows need explicit coordination;
- local `useState`/`useEffect` control flow is becoming difficult to understand because behavior is spread across components or effects.

Prefer plain React/Next.js when the behavior is naturally local and direct:

- static/server-rendered content;
- local field/input state;
- opening/closing a dialog or disclosure;
- selected tab/accordion state;
- a direct navigation or click handler;
- a simple form whose local/framework form state already expresses submit/pending/error clearly;
- straightforward data display/fetching with no client-side journey;
- any case where a `FlowRunner` plus named steps adds ceremony without making control flow clearer.

Decision test:

> If plain React/Next.js is shorter and equally explicit about the behavior, do not use UIFlow.

Use UIFlow when naming states and transitions makes sequencing, branching, side effects, or coordination materially easier to reason about.

## One cohesive journey per flow

A flow should model one user journey or cohesive task, not an entire feature area.

Split when:

- steps belong to different domain ownership/invariants;
- a sub-UI is independently stateful or reusable;
- the flow contains distinct modes that rarely share state;
- the flow grows beyond roughly 6–8 meaningful steps and a cohesive child flow can be named.

Prefer parent/child flow composition to a mega-flow when both parent and child have genuine orchestration responsibilities. Do not create child flows merely to break ordinary component state into more files.

A parent UI step view may render a child `FlowRunner` directly when that child represents a cohesive localized workflow such as a multi-state edit/save/retry sequence, creation wizard, confirmation sequence, or independently orchestrated panel/modal. Use channels only when parent/child or sibling flows need explicit cross-flow coordination.

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

If removing UIFlow entirely leaves the behavior just as explicit and easier to maintain, plain React/Next.js is the correct implementation.

If UIFlow is warranted, then keep the flow itself minimal: if removing a channel, wrapper, helper layer, child flow, or step leaves behavior and clarity unchanged or improved, remove it.

UIFlow is the default orchestration model for qualifying journeys, not a mandatory wrapper around all new feature code. Existing non-UIFlow code does not require migration unless the requested change exposes an orchestration problem that UIFlow would materially simplify or the user explicitly asks for migration.
