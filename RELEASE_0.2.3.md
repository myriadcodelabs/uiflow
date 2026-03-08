# UIFlow 0.2.3

## Summary

This release fixes a stale React closure issue in `FlowRunner` channel transitions.

When a channel emitted after the flow had already moved to a new step, `channelTransitions`
could evaluate against an older captured flow snapshot instead of the latest runtime state.
This affected `currentStep`, `domain`, `internal`, and the resolved event channel map used by
the transition resolver.

## Changes

- Fixed stale flow state reads inside channel-triggered transitions in `FlowRunner`.
- Added regression coverage for channel transitions using the latest current step after a normal step change.
- Preserved the known async action race as a skipped test with a TODO note for future runtime API design.

## Validation

- `pnpm test test/flow-runner/channels.test.tsx test/flow-runner/action-render.test.tsx`
- `pnpm build`

## Notes

Known follow-up:
- Async action completion ordering is still intentionally not enforced by the library.
- The test remains in the suite as a skipped record while the runtime API for explicit consumer control is designed.
