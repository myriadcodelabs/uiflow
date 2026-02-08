# UIFlow

Code-first flow orchestration for React.

UIFlow helps you build multi-step UI without scattering state and transition logic across many components. You define steps in one place, and each step decides what comes next.

## Why UIFlow

- Keep flow logic explicit: step names + transitions are centralized.
- Mix UI and async logic naturally: both are first-class steps.
- Share state across independent flows with channels.
- Stay in plain TypeScript objects, not custom DSLs.

## Mental model (60 seconds)

A flow is:
- `steps`: a map of step names to step definitions
- `start`: first step name

A step is either:
- UI step: `input`, `view`, `onOutput`
- Action step: `input`, `action`, `onOutput`

Transition rule:
- `onOutput` returns next step name (string) to move forward
- returning `void` keeps the same step and re-renders

## Install

```bash
pnpm add @myriadcodelabs/uiflow
# or
npm i @myriadcodelabs/uiflow
# or
yarn add @myriadcodelabs/uiflow
```

## Imports

```ts
import { FlowRunner, defineFlow, createFlowChannel, type OutputHandle } from "@myriadcodelabs/uiflow";
```

Use package-root imports only.

## Quick start (minimal runnable example)

```tsx
"use client";

import { FlowRunner, defineFlow, type OutputHandle } from "@myriadcodelabs/uiflow";

type Data = { name: string };
type AskNameOutput = { action: "setName"; value: string } | { action: "submit" };

function AskNameView(props: {
  input: { name: string };
  output: OutputHandle<AskNameOutput>;
}) {
  return (
    <div>
      <input
        value={props.input.name}
        onChange={(e) => props.output.emit({ action: "setName", value: e.target.value })}
        placeholder="Your name"
      />
      <button onClick={() => props.output.emit({ action: "submit" })}>Continue</button>
    </div>
  );
}

function DoneView(props: { input: { message: string }; output: OutputHandle<never> }) {
  return <h2>{props.input.message}</h2>;
}

const onboardingFlow = defineFlow<Data>(
  {
    askName: {
      input: (data) => ({ name: data.name }),
      view: AskNameView,
      onOutput: (data, output) => {
        if (output.action === "setName") {
          data.name = output.value;
          return;
        }
        if (output.action === "submit") {
          return "done";
        }
      },
    },

    done: {
      input: (data) => ({ message: `Welcome, ${data.name || "friend"}!` }),
      view: DoneView,
      onOutput: () => {},
    },
  },
  { start: "askName" }
);

export function App() {
  return <FlowRunner flow={onboardingFlow} initialData={{ name: "" }} />;
}
```

## Practical pattern: study/review flow (real-world)

This pattern is taken from practical flashcards usage.

```ts
import { defineFlow } from "@myriadcodelabs/uiflow";

type Data = {
  deckId: string;
  flowData: {
    cards: Array<{ id: string; flipped: boolean; rating: "easy" | "good" | "hard" | "again" | null }>;
    activeCardId: string | null;
  };
};

type StudyOutput =
  | { action: "flip"; cardId: string }
  | { action: "rate"; cardId: string; rating: "easy" | "good" | "hard" | "again" }
  | { action: "next"; cardId: string };

export const studyFlow = defineFlow<Data>(
  {
    fetchCards: {
      input: (data) => ({ deckId: data.deckId }),
      action: async ({ deckId }, data) => {
        const cards = await fetchCardsListAction(deckId);
        data.flowData.cards = (cards ?? []).map((c) => ({ id: c.id, flipped: false, rating: null }));
        data.flowData.activeCardId = null;
        return { ok: true };
      },
      onOutput: () => "decide",
    },

    decide: {
      input: (data) => ({ hasCards: data.flowData.cards.length > 0 }),
      action: ({ hasCards }) => hasCards,
      onOutput: (_, hasCards) => (hasCards ? "study" : "empty"),
    },

    study: {
      input: (data) => ({ cards: data.flowData.cards, activeCardId: data.flowData.activeCardId }),
      view: StudyCardsView,
      onOutput: (data, output: StudyOutput, events) => {
        if (output.action === "flip") {
          data.flowData.activeCardId = output.cardId;
          const card = data.flowData.cards.find((c) => c.id === output.cardId);
          if (card) card.flipped = true;
          return "study";
        }

        if (output.action === "rate") {
          data.flowData.activeCardId = output.cardId;
          const card = data.flowData.cards.find((c) => c.id === output.cardId);
          if (card) card.rating = output.rating;
          return "review";
        }

        if (output.action === "next") {
          events?.studiedCounter.emit((n: number) => n + 1);
          data.flowData.activeCardId = null;
          return "fetchCards";
        }
      },
    },

    review: {
      input: (data) => ({
        deckId: data.deckId,
        cardId: data.flowData.activeCardId,
        rating: data.flowData.cards.find((c) => c.id === data.flowData.activeCardId)?.rating,
      }),
      action: async ({ deckId, cardId, rating }) => {
        await reviewCard(deckId, cardId, rating);
        return { ok: true };
      },
      onOutput: (data, _, events) => {
        events?.studiedCounter.emit((n: number) => n + 1);
        data.flowData.activeCardId = null;
        return "fetchCards";
      },
    },

    empty: {
      input: () => ({}),
      view: EmptyView,
      onOutput: () => {},
    },
  },
  { start: "fetchCards" }
);
```

## Cross-flow communication with channels

Use channels when two independent flows need shared reactive state.

```tsx
"use client";

import { useMemo } from "react";
import { createFlowChannel, FlowRunner } from "@myriadcodelabs/uiflow";

export function FlashcardsScreen({ deckId }: { deckId: string }) {
  const studiedCounter = useMemo(() => createFlowChannel<number>(0), []);
  const channels = useMemo(() => ({ studiedCounter }), [studiedCounter]);

  return (
    <>
      <FlowRunner flow={counterFlow} initialData={{}} eventChannels={channels} />
      <FlowRunner
        flow={studyFlow}
        initialData={{ deckId, flowData: { cards: [], activeCardId: null } }}
        eventChannels={channels}
      />
    </>
  );
}
```

## API reference

### `defineFlow(steps, { start })`
- Validates `start` exists in `steps`.
- Supports optional `channelTransitions` mapping (`channelKey -> resolver`).
- A resolver receives `{ data, currentStep, events, channelKey }` and returns `nextStep | void` (sync/async).
- Returns flow definition consumed by `FlowRunner`.

Example:

```ts
const flow = defineFlow(
  {
    fetchList: { /* ... */ },
    showList: { /* ... */ },
  },
  {
    start: "fetchList",
    channelTransitions: {
      refresh: ({ events, currentStep }) => {
        const refreshCount = events?.refresh.get() ?? 0;
        if (refreshCount > 0 && currentStep !== "fetchList") return "fetchList";
        return;
      },
    },
  }
);
```

### `FlowRunner`

```tsx
<FlowRunner flow={flow} initialData={initialData} eventChannels={channels} />
```

Props:
- `flow`: flow definition
- `initialData`: mutable per-flow data object
- `eventChannels?`: optional channels map
- `eventChannelsStrategy?`: `"sticky"` (default) or `"replace"`

### `createFlowChannel(initial)`
Creates channel with:
- `get()`
- `emit(update)`
- `subscribe(listener)`

### `OutputHandle<O>`
UI steps emit events with:
- `output.emit(payload)`

## How to keep flows manageable

1. Keep views dumb: render from `input`, emit intent via `output.emit`.
2. Keep transition logic in `onOutput` only.
3. Use discriminated unions for UI output types.
4. Co-locate domain state (example: card + flipped + rating in one structure).
5. Use helper functions for repeated state ops.
6. Split long flows into focused steps (`fetch`, `decide`, `view`, `commit`).

## Important runtime behavior

1. A step is treated as action step when it has `action` and does not have `view`.
2. Action step runs automatically when it becomes current.
3. `FlowRunner` normalizes channels before subscribing:
   - `"sticky"` (default): keeps first-seen channel instance per key.
   - `"replace"`: uses the latest incoming channel instances.
4. Channel emissions trigger re-render for subscribed runners.
5. If `channelTransitions[channelKey]` exists, channel `emit` runs that resolver and transitions when a valid step is returned.
6. Errors in `onOutput`, action steps, or channel transition resolvers are logged (`console.error`) and not rethrown.
7. Returning unknown step or `void` does not change current step.
8. `initialData` is shallow-copied at runner initialization.

## Pitfalls to avoid

1. Creating channel instances directly in render can reset channel value if keys change or if using `"replace"` strategy.
2. Rebuilding `eventChannels` object each render is safe; `FlowRunner` deduplicates equivalent maps internally.
3. Using `output.done(...)` instead of `output.emit(...)`.
4. Mixing `view` and `action` in the same step.
5. Returning transition targets that do not exist.
6. Using static values in `channelTransitions`; each channel entry must be a resolver function.

## Next.js notes

- `FlowRunner` and UI step views should be in client components.
- Add `"use client"` at the top where needed.
- Server actions can be called inside action steps.

## FAQ

### Why not just `useState` + `useEffect`?

You can for simple screens. UIFlow is useful when screens become multi-step and transitions/side-effects spread across components.

### Is flow data immutable?

No. Flow data is mutable by design inside step handlers.

### Can I have multiple flows on one page?

Yes. Use channels when they need to communicate.

## Complete checklist before shipping

1. `start` exists and all transitions target valid step keys.
2. UI outputs are typed unions.
3. Views only emit intent.
4. Async work is in action steps.
5. Channels are stable and reused.
6. No internal-path imports.

## License

MIT
