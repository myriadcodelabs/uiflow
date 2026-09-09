# UIFlow in Next.js

Use this reference together with the project's Next.js architecture skill. UIFlow defines feature orchestration; Next.js architecture owns routing, server/client boundaries, and physical placement.

## App Router boundary

Keep App Router files thin and server-capable by default.

Preferred shape:

```text
server page/layout
  ↓ serializable initial data
small client FlowRunner entry
  ↓
UIFlow flow + UI step views
```

Do not mark an entire `page.tsx` or `layout.tsx` with `"use client"` merely because the feature uses UIFlow.

Create a feature-owned client entry component for the runner:

```tsx
"use client";

import { FlowRunner } from "@myriadcodelabs/uiflow";
import { featureFlow } from "./feature-flow";

export function FeatureFlowClient({ initialData }: { initialData: DomainData }) {
  return <FlowRunner flow={featureFlow} initialData={initialData} />;
}
```

The server route can fetch/prepare serializable initial domain data and render this client boundary.

UI step views execute in the client graph. A view file does not need a redundant `"use client"` directive merely because it is imported exclusively beneath an existing client boundary; add one when the file itself is intended to be a client entry boundary or is also imported from server-side code.

## Important: action steps run on the client

UIFlow `action` steps are executed by `FlowRunner` in React client runtime. The word `action` does **not** mean a Next.js Server Action.

Therefore never put these directly inside a UIFlow action step:

- database access;
- filesystem access;
- private service credentials/secrets;
- server-only SDKs/modules;
- privileged backend logic.

Instead call a real backend/API or an imported Next.js Server Action from the UIFlow action step.

Example:

```ts
save: {
  input: (_domain, internal) => ({ draft: internal.draft }),
  action: async ({ draft }) => saveDraftAction(draft),
  onOutput: (_domain, internal, result) => {
    if (!result.ok) {
      internal.ui.saveError = result.message;
      return "edit";
    }
    return "done";
  },
}
```

The imported Server Action owns server-only work; UIFlow owns the client-side journey around that work.

## Server-provided initial data

`FlowRunner.initialData` initializes domain data once. If the route can change to represent a different logical flow instance while preserving the same mounted client component, deliberately remount/reset the runner (for example through feature-level identity/keying) rather than expecting `initialData` prop changes to synchronize automatically.

Pass only values compatible with the Next.js server-to-client serialization boundary.

## Data fetching choice

When data is naturally known during server rendering, prefer fetching it on the server and pass the required initial domain data into the client runner.

Use a UIFlow action step for client-time fetching when the fetch is part of the interactive journey, such as:

- refresh/retry;
- dependent loading after user intent;
- pagination/next item;
- mutation followed by another flow state.

Do not duplicate the same initial fetch on both server and client without a concrete reason.

## Error handling

Because UIFlow catches/logs errors from action steps and `onOutput`, do not rely on thrown errors automatically reaching a Next.js route error boundary.

For expected application failures, model explicit result/state transitions:

```text
submit action
  ├── success → done
  └── failure → edit/error UI
```

Use Next.js/server error mechanisms for failures that occur in the actual server boundary, not as a substitute for UIFlow's explicit interactive failure states.

## Channels in Next.js

Create per-screen/per-feature channels inside the client boundary with stable identity:

```tsx
const refresh = useMemo(() => createFlowChannel(0), []);
const channels = useMemo(() => ({ refresh }), [refresh]);
```

Use module-scope channels only when deliberate cross-instance singleton behavior is desired.

Do not create channels during every render and pair them with `eventChannelsStrategy="replace"` unless replacement is explicitly part of the design.
