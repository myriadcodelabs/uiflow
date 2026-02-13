/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */

// src/flow.tsx
import React, { useEffect, useRef, useState } from "react";

// -----------------------------
// Cross-flow event channels
// -----------------------------

// A channel holds a value + allows subscribers to listen for changes.
// This is what lets two independent flows communicate.

export type Updater<T> = T | ((prev: T) => T);

export interface FlowChannel<T> {
    // Read current value
    get: () => T;

    // Update value (either direct value or updater function)
    emit: (update: Updater<T>) => void;

    // Subscribe to changes; returns unsubscribe
    subscribe: (listener: () => void) => () => void;
}

// Map of channels (key -> channel)
// We'll inject this map into FlowRunner later.
export type EventChannels = Record<string, FlowChannel<any>>;

// Factory function to create a channel.
// IMPORTANT: This lives OUTSIDE React, so multiple FlowRunners can share it.
export function createFlowChannel<T>(initial: T): FlowChannel<T> {
    let value = initial;
    const listeners = new Set<() => void>();

    return {
        get: () => value,

        emit: (update: Updater<T>) => {
            value = typeof update === "function" ? (update as (p: T) => T)(value) : update;
            listeners.forEach((l) => l()); // notify all subscribers
        },

        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

// -----------------------------
// Core type definitions
// -----------------------------

/**
 * Shared mutable data for a flow instance.
 * You can refine this to a generic later, e.g. <D>.
 */
export type FlowData = Record<string, any>;

export interface ChannelTransitionContext<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
> {
    domain: DD;
    internal: ID;
    currentStep: string;
    events?: EventChannels;
    channelKey: string;
}

export type ChannelTransitionResolver<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
> =
    (context: ChannelTransitionContext<DD, ID>) => string | void | Promise<string | void>;

/**
 * Output handle given to UI components.
 * They call output.emit(...) when they're finished.
 */
export interface OutputHandle<O = any> {
    emit: (output: O) => void;
}

/**
 * UI step:
 * - Prepares `input` from `data`
 * - Renders `view`
 * - Receives `output` from the component via output.emit()
 * - `onOutput` decides next step and can mutate data
 */
export interface UiStep<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData,
    I = any,
    O = any
> {
    input: (domain: DD, internal: ID, events?: EventChannels) => I;
    view: React.ComponentType<{ input: I; output: OutputHandle<O> }>;
    onOutput: (domain: DD, internal: ID, output: O, events?: EventChannels) => string | void | Promise<string | void>;
}

export type ActionRenderMode = "preserve-previous" | "fallback";

export interface ActionFallbackViewProps<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData,
    I = any
> {
    input: I;
    domain: DD;
    internal: ID;
    events?: EventChannels;
    step: string;
    busy: boolean;
}

export type ActionRenderConfig<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData,
    I = any
> =
    | { mode: "preserve-previous" }
    | {
        mode: "fallback";
        view: React.ComponentType<ActionFallbackViewProps<DD, ID, I>>;
    };

/**
 * Action (logic) step:
 * - Prepares `args` from `data`
 * - Executes `action` (sync/async)
 * - `onOutput` decides next step and can mutate data
 * - No UI
 */
export interface ActionStep<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData,
    I = any,
    O = any
> {
    input: (domain: DD, internal: ID, events?: EventChannels) => I;
    action: (input: I, domain: DD, internal: ID, events?: EventChannels) => O | Promise<O>;
    onOutput: (domain: DD, internal: ID, output: O, events?: EventChannels) => string | void | Promise<string | void>;
    /**
     * Optional action-time render behavior.
     * - preserve-previous: keep previous UI step rendered while action runs.
     * - fallback: render the provided fallback view while action runs.
     * If omitted, action step renders nothing by default.
     */
    render?: ActionRenderConfig<DD, ID, I>;
}

/**
 * A flow step is either:
 *  - a UI step (has `view`)
 *  - an action step (has `action`)
 * but never both at the same time by convention.
 */
export type FlowStep<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
> =
    | UiStep<DD, ID, any, any>
    | ActionStep<DD, ID, any, any>;

/**
 * Map of step names -> step definitions.
 */
export type FlowSteps<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
> = Record<
    string,
    FlowStep<DD, ID>
>;

/**
 * Flow definition object returned by defineFlow.
 */
export interface FlowDefinition<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
> {
    steps: FlowSteps<DD, ID>;
    start: string;
    channelTransitions?: Record<string, ChannelTransitionResolver<DD, ID>>;
    createInternalData?: () => ID;
}

/**
 * Options when defining a flow.
 */
export interface DefineFlowOptions<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
> {
    start: string;
    /**
     * Optional channel transition mapping.
     * Each channel key maps to a resolver function with conditional logic
     * that returns target step name (or void to stay).
     */
    channelTransitions?: Record<string, ChannelTransitionResolver<DD, ID>>;
    /**
     * Optional factory for flow-owned internal state.
     */
    createInternalData?: () => ID;
}

/**
 * Main entry point to define a flow.
 */
export function defineFlow<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
>(
    steps: FlowSteps<DD, ID>,
    options: DefineFlowOptions<DD, ID>
): FlowDefinition<DD, ID> {
    if (!options.start || !steps[options.start]) {
        throw new Error(
            `defineFlow: 'start' must be provided and exist in steps. Got '${options.start}'.`
        );
    }

    return {
        steps,
        start: options.start,
        channelTransitions: options.channelTransitions,
        createInternalData: options.createInternalData,
    };
}




// -----------------------------
// FlowRunner component
// -----------------------------

export interface FlowRunnerProps<DD extends FlowData = FlowData, ID extends FlowData = FlowData> {
    flow: FlowDefinition<DD, ID>;
    initialData: DD;

    // NEW:
    // Optional map of shared channels.
    // If you don't pass it, the flow behaves exactly like before.
    eventChannels?: EventChannels;

    /**
     * How FlowRunner treats incoming eventChannels across parent re-renders.
     * - "sticky" (default): keep first-seen channel instance per key; ignore replacements for existing keys.
     * - "replace": accept incoming channels as source of truth.
     */
    eventChannelsStrategy?: "sticky" | "replace";
}

/**
 * Internal state for the runner:
 * - current step name
 * - data (mutable but we keep it in React state for re-rendering)
 */
interface RunnerState<DD extends FlowData, ID extends FlowData> {
    currentStep: string;
    domain: DD;
    internal: ID;
}


/**
 * FlowRunner:
 * - drives the current step (UI or action)
 * - manages transitions
 * - renders UI steps
 */
export function FlowRunner<
    DD extends FlowData = FlowData,
    ID extends FlowData = FlowData
>(
    props: Readonly<FlowRunnerProps<DD, ID>>
) {
    const {
        flow,
        initialData,
        eventChannels,
        eventChannelsStrategy = "sticky",
    } = props;

    const resolvedChannelsRef = useRef<EventChannels | undefined>(undefined);

    const getResolvedChannels = (): EventChannels | undefined => {
        const prev = resolvedChannelsRef.current;
        const incoming = eventChannels;

        if (!incoming) {
            resolvedChannelsRef.current = undefined;
            return undefined;
        }

        const incomingEntries = Object.entries(incoming);

        let candidate: EventChannels;

        if (eventChannelsStrategy === "sticky") {
            candidate = {};

            for (const [key, channel] of incomingEntries) {
                candidate[key] = prev?.[key] ?? channel;
            }
        } else {
            candidate = incoming;
        }

        if (prev) {
            const prevKeys = Object.keys(prev);
            const candidateKeys = Object.keys(candidate);

            if (
                prevKeys.length === candidateKeys.length &&
                candidateKeys.every((k) => prev[k] === candidate[k])
            ) {
                return prev;
            }
        }

        resolvedChannelsRef.current = candidate;
        return candidate;
    };

    const resolvedEventChannels = getResolvedChannels();

    const resolveInternalData = (): ID => {
        if (flow.createInternalData) {
            return flow.createInternalData();
        }
        return {} as ID;
    };

    // We keep data and currentStep in state so React re-renders on change.
    const [state, setState] = useState<RunnerState<DD, ID>>({
        currentStep: flow.start,
        domain: { ...initialData },
        internal: { ...resolveInternalData() },
    });

    const [busy, setBusy] = useState(false); // for action steps
    const isMountedRef = useRef(true);
    const previousUiStepRef = useRef<string | undefined>(undefined);

    // NEW:
    // This state is never used directly.
    // It only exists to force a re-render when event channels change.
    const [_tick, setTick] = useState(0);

    const { currentStep, domain, internal } = state;

    const applyTransition = (nextStepName?: string | void) => {
        if (!isMountedRef.current) return;

        if (nextStepName && flow.steps[nextStepName]) {
            setState((prev) => ({
                ...prev,
                currentStep: nextStepName,
                domain: { ...prev.domain }, // new references to trigger React updates (memo-safe)
                internal: { ...prev.internal },
            }));
        } else {
            // no next step: just re-render with updated data if any
            setState((prev) => ({
                ...prev,
                domain: { ...prev.domain },
                internal: { ...prev.internal },
            }));
        }
    };

    const runChannelTransition = async (channelKey: string): Promise<void> => {
        const transition = flow.channelTransitions?.[channelKey];
        if (!transition) {
            setTick((x) => x + 1);
            return;
        }

        try {
            const nextStep = await transition({
                domain,
                internal,
                currentStep,
                events: resolvedEventChannels,
                channelKey,
            });
            if (nextStep) {
                applyTransition(nextStep);
                return;
            }

            setTick((x) => x + 1);
        } catch (e) {
            console.error("FlowRunner channel transition error:", e);
            setTick((x) => x + 1);
        }
    };

    // Subscribe to every provided channel and keep subscriptions in sync
    // with the current eventChannels prop.
    useEffect(() => {
        if (!resolvedEventChannels) return;

        const unsubs = Object.entries(resolvedEventChannels).map(([channelKey, ch]) =>
            ch.subscribe(() => {
                void runChannelTransition(channelKey);
            })
        );

        return () => unsubs.forEach((u) => u());
        // applyTransition and runChannelTransition are recreated each render;
        // subscription identity is driven by channels map.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flow.channelTransitions, resolvedEventChannels]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const step = flow.steps[currentStep];

    // If the step is an action (no view), run it in an effect.
    const isActionStep = (step as any).action && !(step as any).view;

    if (!isActionStep && step && (step as any).view) {
        previousUiStepRef.current = currentStep;
    }

    useEffect(() => {
        if (!isActionStep) return;

        const actionStep = step as ActionStep<DD, ID, any, any>;

        (async () => {
            try {
                setBusy(true);
                const input = actionStep.input(state.domain, state.internal, resolvedEventChannels);
                const output = await actionStep.action(input, state.domain, state.internal, resolvedEventChannels);
                const next = await actionStep.onOutput(state.domain, state.internal, output, resolvedEventChannels);
                applyTransition(next);
            } catch (e) {
                console.error("FlowRunner action step error:", e);
                // In a real lib, route to a dedicated error step or surface error up
            } finally {
                if (isMountedRef.current) setBusy(false);
            }
        })();
        // We only want to run this when step changes, not on arbitrary data changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep]);



    if (!step) {
        // Fails fast if flow is misconfigured.
        return (
            <div>
                <strong>FlowRunner error:</strong> Unknown step "{currentStep}".
            </div>
        );
    }

    // Helper to apply a next step (if returned) and ensure React re-renders

    // -----------------------
    // ACTION STEP HANDLING
    // -----------------------
    if (isActionStep) {
        const actionStep = step as ActionStep<DD, ID, any, any>;
        const actionRender = actionStep.render;
        if (actionRender?.mode === "preserve-previous") {
            const previousUiStepName = previousUiStepRef.current;
            const previousStep = previousUiStepName
                ? flow.steps[previousUiStepName]
                : undefined;
            const isPreviousUiStep = !!previousStep && !!(previousStep as any).view;

            if (isPreviousUiStep) {
                const uiStep = previousStep as UiStep<DD, ID, any, any>;
                const ViewComponent = uiStep.view;
                const input = uiStep.input(domain, internal, resolvedEventChannels);

                const outputHandle: OutputHandle<any> = {
                    emit: () => {
                        // While action is active, previous view stays visual-only.
                    },
                };

                return <ViewComponent input={input} output={outputHandle} />;
            }
        }

        if (actionRender && actionRender.mode === "fallback") {
            const FallbackView = actionRender.view;
            const input = actionStep.input(domain, internal, resolvedEventChannels);
            return (
                <FallbackView
                    input={input}
                    domain={domain}
                    internal={internal}
                    events={resolvedEventChannels}
                    step={currentStep}
                    busy={busy}
                />
            );
        }

        // Default action rendering behavior is intentionally empty.
        return null;
    }

    // -----------------------
    // UI STEP HANDLING
    // -----------------------

    const uiStep = step as UiStep<DD, ID, any, any>;
    const ViewComponent = uiStep.view;
    const input = uiStep.input(domain, internal, resolvedEventChannels);

    const outputHandle: OutputHandle<any> = {
        emit: async (output) => {
            try {
                const next = await uiStep.onOutput(domain, internal, output, resolvedEventChannels);
                applyTransition(next);
            } catch (e) {
                console.error("FlowRunner UI step onOutput error:", e);
            }
        },
    };

    return <ViewComponent input={input} output={outputHandle} />;
}
