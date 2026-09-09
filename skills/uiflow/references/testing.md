# Testing UIFlow

Test observable flow behavior rather than implementation trivia. Use the application's normal React test stack; React Testing Library + user-event is a suitable pattern.

Consumer application tests should import UIFlow from the package root. Tests inside the UIFlow library repository may import source directly when they are testing the library implementation itself.

## Core behavior tests

For a materially changed flow, cover the relevant behaviors:

- initial/start step renders or runs correctly;
- UI intent emitted by a view reaches `onOutput` and transitions correctly;
- `void` transition keeps the step while mutated state re-renders;
- action steps auto-run when entered and transition on completion;
- expected failure results lead to the intended UI/state;
- all material branch targets exist.

Do not write a separate test merely for every step if one user-level scenario naturally proves several transitions.

## Action render tests

When action latency is visible, verify the configured policy:

- default action step renders nothing;
- `preserve-previous` keeps the previous UI visible;
- `fallback` renders the provided fallback until completion.

Remember that the previous view under `preserve-previous` is visual-only while the action is active. Do not write application behavior that depends on its output handler remaining active.

For async action tests, use a controllable deferred promise when useful so the test can assert the in-flight UI before completing the action.

## Channel tests

When channels are part of behavior, verify only the semantics actually used:

- channel emission causes subscribed UI to reflect the new value;
- `channelTransitions` changes step only under the intended condition;
- sticky identity remains stable when parent renders a replacement instance for an existing key;
- replace semantics use the latest channel when the feature intentionally opts into replacement.

Keep channel instances stable in the test setup just as production code should.

## State ownership tests

Test outcomes, not direct internal object mutation unless the internal state itself is part of a public library test.

For consumer features, exercise the flow through rendered UI/actions and assert user-visible behavior or external effects.

When a route/entity identity is expected to create a new flow instance, test the application's remount/reset boundary rather than assuming changes to `initialData` update an existing runner.

## What not to over-test

Avoid tests that merely duplicate UIFlow's own library contract in every consuming application, such as proving that `defineFlow` rejects a missing start step. Test UIFlow internals in this repository; in consuming applications, focus on the feature's own flow behavior.
