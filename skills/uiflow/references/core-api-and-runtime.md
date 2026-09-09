# UIFlow Core API and Runtime

Use package-root imports only:

```ts
import {
  FlowRunner,
  defineFlow,
  createFlowChannel,
  type OutputHandle,
} from "@myriadcodelabs/uiflow";
```

Never import from `dist/*` or another package-internal path in application code.

## State model

Prefer the current two-state model:

```ts
type DomainData = {
  entityId: string;
};

type InternalData = {
  item: Item | null;
  ui: {
    review: {
      error: string | null;
    };
  };
};

const flow = defineFlow<DomainData, InternalData>(
  { /* steps */ },
  {
    start: "load",
    createInternalData: () => ({
      item: null,
      ui: { review: { error: null } },
    }),
  },
);
```

- `DomainData` comes from the caller via `FlowRunner.initialData`.
- `InternalData` belongs to the flow and should be initialized with `createInternalData()`.
- If there is no caller-provided domain input, use `type DomainData = {}` and `initialData={{}}`.
- Domain/internal data are mutable inside step handlers by design.
- `FlowRunner` shallow-copies `initialData` once when the runner initializes. Do not expect later `initialData` prop changes to synchronize into an existing runner.
- Because the copy is shallow, nested domain references are not automatically isolated from the caller. Do not assume deep-copy semantics.

## UI steps

A UI step has:

```ts
{
  input: (domain, internal, events) => viewModel,
  view: SomeView,
  onOutput: (domain, internal, output, events) => nextStepOrVoid,
}
```

The view receives exactly the flow contract:

```ts
type Props = {
  input: ViewInput;
  output: OutputHandle<ViewOutput>;
};
```

The view emits intent through:

```ts
output.emit(payload)
```

not `output.done(...)`, direct flow transitions, or imperative mutation of the runner.

`onOutput` may be sync or async. Returning a valid step name transitions. Returning `void` or an unknown step keeps the current step and re-renders mutated data.

## Action steps

An action step has:

```ts
{
  input: (domain, internal, events) => actionInput,
  action: async (input, domain, internal, events) => output,
  onOutput: (domain, internal, output, events) => nextStepOrVoid,
  render?: ...,
}
```

Runtime behavior:

- A step is treated as an action step when it has `action` and no `view`.
- It runs automatically when it becomes the current step.
- Do not combine `view` and `action` in one step.
- Action execution is driven by a change of current step. Do not return the same action-step name expecting that action to run again; transition through a distinct step when another execution is required.
- Errors from action execution are logged and not rethrown by `FlowRunner`. Model user-visible failures explicitly in action output/internal state and transition to the intended UI/error state.

### Action rendering

Default action rendering is `null` while the action runs.

Keep the prior UI visible:

```ts
render: { mode: "preserve-previous" }
```

The preserved view is visual-only while the action is active: its `output.emit(...)` is intentionally ignored.

Render a dedicated busy view:

```ts
render: {
  mode: "fallback",
  view: SavingView,
}
```

Fallback views receive `input`, `domain`, `internal`, `events`, `step`, and `busy`.

Choose render policy intentionally whenever an action has noticeable latency.

## Channels

Create a channel with:

```ts
const refresh = createFlowChannel(0);
```

A channel exposes:

- `get()`
- `emit(valueOrUpdater)`
- `subscribe(listener)`

Pass channels to the runner:

```tsx
<FlowRunner
  flow={flow}
  initialData={initialData}
  eventChannels={{ refresh }}
/>
```

Use optional access in steps:

```ts
events?.refresh?.get()
events?.refresh?.emit((n: number) => n + 1)
```

`eventChannelsStrategy`:

- `"sticky"` is the default and retains the first channel instance for an existing key across parent re-renders.
- `"replace"` accepts the latest incoming channel instance and should be used only when replacement semantics are intentional.

Any subscribed channel emission re-renders the runner. A `channelTransitions` resolver may additionally move the flow:

```ts
channelTransitions: {
  refresh: ({ currentStep, events }) => {
    const count = events?.refresh?.get() ?? 0;
    if (count > 0 && currentStep !== "load") return "load";
    return;
  },
}
```

Each channel transition entry must be a resolver function, not a static step string. Resolver errors are logged and the runner remains on its current step.
