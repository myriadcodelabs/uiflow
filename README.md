# UIFlow

**Explicit UI orchestration for React, without scattering a user journey across `useState`, `useEffect`, handlers, and loading flags.**

UIFlow is a small, code-first flow runner for React. You describe a user journey as named **UI steps** and **action steps**, then keep transitions in one place.

```text
edit → save → success
       └──→ error → edit
```

No visual flow editor. No custom state-machine DSL. No global store required.

Just TypeScript objects, React components, and explicit transitions.

```ts
const flow = defineFlow(
  {
    edit: { /* render UI */ },
    save: { /* run async work */ },
    done: { /* render success */ },
  },
  { start: "edit" },
);
```

## Why UIFlow

React is already excellent at local component state. UIFlow is for the point where a **journey** becomes harder to reason about than the individual components inside it.

Use it to make these concerns explicit:

- named UI phases instead of several interacting booleans;
- transitions instead of navigation logic spread across components;
- async work as first-class action steps;
- loading/error/success sequencing as part of the flow;
- flow-owned mutable state separate from caller-provided data;
- typed user intent through `output.emit(...)`;
- coordination between independent flows through channels;
- parent/child flows when one screen contains several real workflows.

The result is code that reads much closer to the product behavior:

```text
load → decide → review → save → next
```

rather than forcing a reader to reconstruct that sequence from effects, callbacks, flags, and component wiring.

## When to use it

UIFlow is a good fit when an interaction has a real control-flow problem:

- multiple meaningful phases or UI modes;
- branching based on user intent or data;
- async work with visible pending/error/success states;
- retry/continue/cancel sequences;
- several transitions sharing journey state;
- multiple independent flows that need explicit coordination;
- local `useState` / `useEffect` orchestration is becoming difficult to follow.

UIFlow is **not** meant to replace ordinary React state.

Keep plain React/Next.js for simple input state, dialog open/close, selected tabs, accordions, direct click/navigation handlers, static/server-rendered content, or a simple form whose existing local/framework model is already clearer.

> **Decision rule:** if plain React is shorter and equally explicit, keep plain React. If naming states and transitions makes the journey materially clearer, UIFlow is a strong fit.

## Install

```bash
pnpm add @myriadcodelabs/uiflow
```

Or:

```bash
npm install @myriadcodelabs/uiflow
```

```bash
yarn add @myriadcodelabs/uiflow
```

Import only from the package root:

```ts
import {
  FlowRunner,
  defineFlow,
  createFlowChannel,
  type OutputHandle,
} from "@myriadcodelabs/uiflow";
```

## Mental model

A flow contains named steps and one starting step.

There are two kinds of steps.

### UI step

```text
flow data
   ↓ input(...)
view model
   ↓
React view
   ↓ output.emit(intent)
onOutput(...)
   ↓
next step
```

A UI step has:

```ts
{
  input,
  view,
  onOutput,
}
```

The view renders data and emits intent. The flow decides what that intent means.

### Action step

```text
input(...)
   ↓
action(...)
   ↓
onOutput(...)
   ↓
next step
```

An action step has:

```ts
{
  input,
  action,
  onOutput,
  render?,
}
```

Action steps run automatically when entered.

## Example 1: a two-step onboarding flow

This is the smallest useful shape: one UI phase collects data and another displays the result.

```tsx
"use client";

import {
  FlowRunner,
  defineFlow,
  type OutputHandle,
} from "@myriadcodelabs/uiflow";

type DomainData = {};

type InternalData = {
  name: string;
};

type NameOutput =
  | { type: "change"; value: string }
  | { type: "continue" };

function NameView({
  input,
  output,
}: {
  input: { name: string };
  output: OutputHandle<NameOutput>;
}) {
  return (
    <div>
      <h2>What is your name?</h2>

      <input
        value={input.name}
        onChange={(event) =>
          output.emit({ type: "change", value: event.target.value })
        }
      />

      <button onClick={() => output.emit({ type: "continue" })}>
        Continue
      </button>
    </div>
  );
}

function WelcomeView({
  input,
}: {
  input: { name: string };
  output: OutputHandle<never>;
}) {
  return <h2>Welcome, {input.name || "friend"}!</h2>;
}

const onboardingFlow = defineFlow<DomainData, InternalData>(
  {
    name: {
      input: (_domain, internal) => ({ name: internal.name }),
      view: NameView,
      onOutput: (_domain, internal, output: NameOutput) => {
        if (output.type === "change") {
          internal.name = output.value;
          return;
        }

        return "welcome";
      },
    },

    welcome: {
      input: (_domain, internal) => ({ name: internal.name }),
      view: WelcomeView,
      onOutput: () => {},
    },
  },
  {
    start: "name",
    createInternalData: () => ({ name: "" }),
  },
);

export function Onboarding() {
  return <FlowRunner flow={onboardingFlow} initialData={{}} />;
}
```

The important part is not the number of lines. It is that the behavior is obvious:

```text
name → welcome
```

The view never chooses the next step. It only emits user intent.

## Example 2: async save with explicit success/error flow

This is where UIFlow becomes especially useful. Instead of coordinating `isSaving`, error state, async handlers, and conditional rendering separately, model the journey directly:

```text
edit → save → done
        └── failure → edit
```

```tsx
import { defineFlow } from "@myriadcodelabs/uiflow";

type DomainData = {
  userId: string;
};

type InternalData = {
  draft: string;
  error: string | null;
};

type EditOutput =
  | { type: "change"; value: string }
  | { type: "save" };

export const profileFlow = defineFlow<DomainData, InternalData>(
  {
    edit: {
      input: (_domain, internal) => ({
        draft: internal.draft,
        error: internal.error,
      }),
      view: ProfileFormView,
      onOutput: (_domain, internal, output: EditOutput) => {
        if (output.type === "change") {
          internal.draft = output.value;
          internal.error = null;
          return;
        }

        return "save";
      },
    },

    save: {
      input: (domain, internal) => ({
        userId: domain.userId,
        draft: internal.draft,
      }),
      action: async ({ userId, draft }) => {
        try {
          await saveProfile(userId, draft);
          return { ok: true } as const;
        } catch {
          return { ok: false, message: "Could not save profile" } as const;
        }
      },
      onOutput: (_domain, internal, result) => {
        if (!result.ok) {
          internal.error = result.message;
          return "edit";
        }

        return "done";
      },
      render: {
        mode: "fallback",
        view: SavingView,
      },
    },

    done: {
      input: (_domain, internal) => ({ value: internal.draft }),
      view: SavedView,
      onOutput: () => {},
    },
  },
  {
    start: "edit",
    createInternalData: () => ({
      draft: "",
      error: null,
    }),
  },
);
```

The async operation, its busy UI, its failure path, and its successful continuation are all part of one readable control-flow definition.

## Domain data vs internal data

UIFlow deliberately separates data supplied by the caller from state owned by the journey.

```ts
const flow = defineFlow<DomainData, InternalData>(steps, {
  start: "load",
  createInternalData: () => ({ /* flow-owned defaults */ }),
});
```

Use **domain data** for values that identify or initialize this flow instance:

```ts
type DomainData = {
  orderId: string;
};
```

Use **internal data** for mutable workflow state:

```ts
type InternalData = {
  order: Order | null;
  selectedOption: string | null;
  error: string | null;
};
```

Then mount the flow:

```tsx
<FlowRunner
  flow={checkoutFlow}
  initialData={{ orderId }}
/>
```

`initialData` is shallow-copied when the runner initializes. Use `createInternalData()` for state that belongs to the flow itself.

## Action rendering

An action step renders nothing by default while it runs.

Keep the previous UI visible:

```ts
render: { mode: "preserve-previous" }
```

Or render a dedicated pending view:

```ts
render: {
  mode: "fallback",
  view: SavingView,
}
```

This keeps loading behavior next to the action that causes it.

## Multiple flows and channels

Independent flows can coordinate through lightweight channels.

```tsx
"use client";

import { useMemo } from "react";
import {
  createFlowChannel,
  FlowRunner,
} from "@myriadcodelabs/uiflow";

export function Screen() {
  const refresh = useMemo(() => createFlowChannel(0), []);
  const channels = useMemo(() => ({ refresh }), [refresh]);

  return (
    <>
      <FlowRunner
        flow={editorFlow}
        initialData={{}}
        eventChannels={channels}
      />

      <FlowRunner
        flow={listFlow}
        initialData={{}}
        eventChannels={channels}
      />
    </>
  );
}
```

One flow can emit:

```ts
events?.refresh?.emit((value: number) => value + 1);
```

and another can react to the same channel without introducing a global application store.

Use channels only when flows are genuinely independent. Ordinary components inside one local interaction should usually use normal React props/state.

## Next.js

UIFlow works naturally inside the App Router, but `FlowRunner` is a client-side runtime.

Keep the client boundary small:

```text
Server page/layout
      ↓
serializable initial data
      ↓
small "use client" FlowRunner entry
      ↓
UIFlow journey
```

A UIFlow **action step is not a Next.js Server Action**. UIFlow actions run in the client runtime.

For server-only work, call a real Server Action or backend API from the UIFlow action step:

```ts
action: async ({ draft }) => saveDraftAction(draft)
```

Do not place database access, secrets, filesystem operations, or server-only modules directly inside UIFlow client action steps.

## API at a glance

### `defineFlow(steps, options)`

Creates a flow definition.

```ts
const flow = defineFlow<DomainData, InternalData>(
  steps,
  {
    start: "firstStep",
    createInternalData: () => initialInternalData,
    channelTransitions: {
      refresh: ({ currentStep }) =>
        currentStep === "view" ? "load" : undefined,
    },
  },
);
```

### `FlowRunner`

Runs and renders a flow.

```tsx
<FlowRunner
  flow={flow}
  initialData={domainData}
  eventChannels={channels}
  eventChannelsStrategy="sticky"
/>
```

`eventChannelsStrategy` is `"sticky"` by default. Use `"replace"` only when incoming channel instances are intentionally replaceable.

### `createFlowChannel(initial)`

Creates a shared reactive channel:

```ts
const refresh = createFlowChannel(0);

refresh.get();
refresh.emit((value) => value + 1);
const unsubscribe = refresh.subscribe(() => {});
```

### `OutputHandle<O>`

UI views send typed intent back to their flow with:

```ts
output.emit(payload);
```

## Design rules that keep UIFlow simple

1. **One cohesive journey per flow.** Split unrelated workflows instead of creating mega-flows.
2. **Views stay declarative.** Render `input`; emit user intent.
3. **Transitions stay in `onOutput`.** Views do not choose steps.
4. **Async journey work belongs in action steps.** Keep server-only work behind APIs/Server Actions.
5. **Use discriminated output unions.** Make user intent explicit.
6. **Use channels only across real flow boundaries.** Do not create an event bus for ordinary local state.
7. **Prefer the smallest clear solution.** UIFlow should remove control-flow ambiguity, not add ceremony.

## Coding-agent guidance

UIFlow ships guidance intended to help coding agents generate consistent flow code.

On install, the package attempts to place the canonical generation guidance and supported local skill files into common project-local locations.

If install scripts are disabled, run:

```bash
npx @myriadcodelabs/uiflow install-agent-assets
```

The canonical guide in this repository is:

```text
code_generation_guidelines/uiflow_llm_guidelines.md
```

The repo-local agent skill is under:

```text
skills/uiflow/
```

## FAQ

### Is UIFlow a replacement for `useState`?

No. Use React state for ordinary local interaction. UIFlow is for explicit journey/orchestration state.

### Is UIFlow a state-machine library?

It has state-machine-like benefits—named states and explicit transitions—but intentionally stays close to plain TypeScript and React rather than introducing a separate machine DSL.

### Is flow data immutable?

No. Domain and internal flow data are mutable inside step handlers by design.

### Can a page contain more than one flow?

Yes. Parent views can render child `FlowRunner` instances, and independent flows can coordinate through channels when necessary.

### Does UIFlow work with Next.js?

Yes. Mount `FlowRunner` inside a client boundary and keep server-only work behind Next.js Server Actions or backend APIs.

## License

MIT
