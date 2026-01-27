# UIFlow

Explicit, code-first UI flow orchestration for React. UIFlow lets you define flows as plain objects with named steps, mix UI and logic steps, and move between them by returning the next step name. It’s useful when you want predictable, testable multi‑step experiences without wiring up routers, wizards, or state machines by hand.

## Why it matters

- **Clarity:** Flows are defined in one place with explicit step names and transitions.
- **Flexibility:** Combine UI steps and async logic steps in the same flow.
- **Reusability:** Share cross‑flow state through event channels.

## Quick example

```tsx
import React from "react";
import { FlowRunner, defineFlow, createFlowChannel } from "@myriadcodelabs/uiflow";

type StudyData = {
  deckId: string;
  cards: CardWithState[];
  activeCardId: string | null;
};

type CardWithState = {
  id: string;
  question: string;
  answer: string;
  flipped: boolean;
  rating: "easy" | "medium" | "hard" | null;
};

export type ShowCardOutput =
    | { action: "flip"; cardId: string }
    | { action: "rate"; rating: Rating; cardId: string }
    | { action: "next"; cardId: string };

const studiedCounter = createFlowChannel<number>(0);


const studyFlow = defineFlow<StudyData>(
  {
    // step 1
    fetchCards: {
      input: (data) => ({ deckId: data.deckId }),
      action: async ({ deckId }, data) => {
        const cards = await fakeFetchCards(deckId);
        data.cards = cards.map((card) => ({ ...card, flipped: false, rating: null }));
        data.activeCardId = null;
        return { ok: true };
      },
      onOutput: () => "decide",
    },

    // step 2
    decide: {
      input: (data) => ({ hasCards: data.cards.length > 0 }),
      action: ({ hasCards }) => hasCards,
      onOutput: (_, exists) => (exists ? "study" : "noCard"),
    },
    // if no card present
    noCard: {
      input: () => ({}),
      view: NoCardView,
      onOutput: () => {},
    },
    // step 3
    study: {
      input: (data) => ({ cards: data.cards }),
      view: CardView,
      onOutput: (data, output, events) => {
        const card = data.cards.find((c) => c.id === output.cardId);
        if (!card) return "study";

        if (output.action === "flip") {
          data.activeCardId = card.id;
          card.flipped = true;
          return "study";
        }

        if (output.action === "rate") {
          data.activeCardId = card.id;
          card.rating = output.rating ?? null;
          return "review";
        }

        if (output.action === "next") {
          events?.studiedCounter.emit((c) => c + 1);
          data.activeCardId = null;
          return "fetchCards";
        }
      },
    },

    // step 4: if user does review
    review: {
      input: (data) => ({
        deckId: data.deckId,
        cardId: data.activeCardId!,
        rating: data.cards.find((c) => c.id === data.activeCardId)?.rating!,
      }),
      action: async ({ deckId, cardId, rating }) => {
        await fakeReviewCard(deckId, cardId, rating);
        return { ok: true };
      },
      onOutput: (data, _, events) => {
        events?.studiedCounter.emit((c) => c + 1);
        data.activeCardId = null;
        return "fetchCards";
      },
    },
  },
  { start: "fetchCards" }
);
```

The example components are defined here.

```tsx
const CardView: React.FC<{
  input: { cards: CardWithState[] };
  output: OutputHandle<ShowCardOutput>;
}> = ({ input, output }) => (
  <div>
    {input.cards.map((card) => (
      <div key={card.id}>
        <div>{card.question}</div>
        {card.flipped ? <div>{card.answer}</div> : null}
        <button onClick={() => output.emit({ cardId: card.id, action: "flip" })}>Show Answer</button>
        <button onClick={() => output.emit({ cardId: card.id, action: "rate", rating: "easy" })}>Easy</button>
        <button onClick={() => output.emit({ cardId: card.id, action: "rate", rating: "medium" })}>Medium</button>
        <button onClick={() => output.emit({ cardId: card.id, action: "rate", rating: "hard" })}>Hard</button>
        <button onClick={() => output.emit({ cardId: card.id, action: "next" })}>Next</button>
      </div>
    ))}
  </div>
);

const NoCardView: React.FC<{ input: {}; output: { emit: () => void } }> = () => (
  <div>No cards available.</div>
);
```
The FlowRunner is used to call the flow and set initial data and channels.

```tsx
export function App() {
  return (
    <FlowRunner
      flow={studyFlow}
      initialData={{ deckId: "deck-1", cards: [], activeCardId: null }}
      eventChannels={{ studiedCounter }}
    />
  );
}
```

## API Reference (exported only)

### 1) Where the flow is called

#### `FlowRunner` (React component)
Runs a flow and renders UI steps.

```tsx
<FlowRunner flow={flow} initialData={initialData} eventChannels={channels} />
```

- `flow: FlowDefinition<D>` — created by `defineFlow`.
- `initialData: D` — shared mutable data for this flow instance.
- `eventChannels?: EventChannels` — optional shared channels; emitting causes re-render.

### 2) Where the flow is defined

#### `defineFlow<D>(steps: FlowSteps<D>, options: DefineFlowOptions): FlowDefinition<D>`
Creates a flow definition from a steps map and a required `start` step name.

- `DefineFlowOptions.start: string` — name of the first step.

#### `createFlowChannel<T>(initial: T): FlowChannel<T>`
Creates a shared channel for cross‑flow communication.

- `FlowChannel.get(): T` — read the current value.
- `FlowChannel.emit(update: T | (prev: T) => T): void` — update value and notify subscribers.
- `FlowChannel.subscribe(listener: () => void): () => void` — listen for changes.


### 3) A UI component

#### `OutputHandle<O>`
Used by UI steps to emit output back into the flow.

- `OutputHandle.emit(output: O): void`
