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

export interface ChannelTransitionContext<D extends FlowData = FlowData> {
    data: D;
    currentStep: string;
    events?: EventChannels;
    channelKey: string;
}

export type ChannelTransitionResolver<D extends FlowData = FlowData> =
    (context: ChannelTransitionContext<D>) => string | void | Promise<string | void>;

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
export interface UiStep<D extends FlowData = FlowData, I = any, O = any> {
    input: (data: D, events?: EventChannels) => I;
    view: React.ComponentType<{ input: I; output: OutputHandle<O> }>;
    onOutput: (data: D, output: O, events?: EventChannels) => string | void | Promise<string | void>;
}

/**
 * Action (logic) step:
 * - Prepares `args` from `data`
 * - Executes `action` (sync/async)
 * - `onOutput` decides next step and can mutate data
 * - No UI
 */
export interface ActionStep<D extends FlowData = FlowData, I = any, O = any> {
    input: (data: D, events?: EventChannels) => I;
    action: (input: I, data: D, events?: EventChannels) => O | Promise<O>;
    onOutput: (data: D, output: O, events?: EventChannels) => string | void | Promise<string | void>;
}

/**
 * A flow step is either:
 *  - a UI step (has `view`)
 *  - an action step (has `action`)
 * but never both at the same time by convention.
 */
export type FlowStep<D extends FlowData = FlowData> =
    | UiStep<D, any, any>
    | ActionStep<D, any, any>;

/**
 * Map of step names -> step definitions.
 */
export type FlowSteps<D extends FlowData = FlowData> = Record<
    string,
    FlowStep<D>
>;

/**
 * Flow definition object returned by defineFlow.
 */
export interface FlowDefinition<D extends FlowData = FlowData> {
    steps: FlowSteps<D>;
    start: string;
    channelTransitions?: Record<string, ChannelTransitionResolver<D>>;
}

/**
 * Options when defining a flow.
 */
export interface DefineFlowOptions<D extends FlowData = FlowData> {
    start: string;
    /**
     * Optional channel transition mapping.
     * Each channel key maps to a resolver function with conditional logic
     * that returns target step name (or void to stay).
     */
    channelTransitions?: Record<string, ChannelTransitionResolver<D>>;
}

/**
 * Main entry point to define a flow.
 */
export function defineFlow<D extends FlowData = FlowData>(
    steps: FlowSteps<D>,
    options: DefineFlowOptions<D>
): FlowDefinition<D> {
    if (!options.start || !steps[options.start]) {
        throw new Error(
            `defineFlow: 'start' must be provided and exist in steps. Got '${options.start}'.`
        );
    }

    return {
        steps,
        start: options.start,
        channelTransitions: options.channelTransitions,
    };
}




// -----------------------------
// FlowRunner component
// -----------------------------

export interface FlowRunnerProps<D extends FlowData = FlowData> {
    flow: FlowDefinition<D>;
    initialData: D;

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
interface RunnerState<D extends FlowData> {
    currentStep: string;
    data: D;
}


/**
 * FlowRunner:
 * - drives the current step (UI or action)
 * - manages transitions
 * - renders UI steps
 */
export function FlowRunner<D extends FlowData = FlowData>(
    props: Readonly<FlowRunnerProps<D>>
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

    // We keep data and currentStep in state so React re-renders on change.
    const [state, setState] = useState<RunnerState<D>>({
        currentStep: flow.start,
        data: { ...initialData },
    });

    const [busy, setBusy] = useState(false); // for action steps
    const isMountedRef = useRef(true);

    // NEW:
    // This state is never used directly.
    // It only exists to force a re-render when event channels change.
    const [_tick, setTick] = useState(0);

    const { currentStep, data } = state;

    const applyTransition = (nextStepName?: string | void) => {
        if (!isMountedRef.current) return;

        if (nextStepName && flow.steps[nextStepName]) {
            setState((prev) => ({
                ...prev,
                currentStep: nextStepName,
                data: { ...prev.data }, // new reference to trigger React updates (memo-safe)
            }));
        } else {
            // no next step: just re-render with updated data if any
            setState((prev) => ({
                ...prev,
                data: { ...prev.data },
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
                data,
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

    useEffect(() => {
        if (!isActionStep) return;

        const actionStep = step as ActionStep<D, any, any>;

        (async () => {
            try {
                setBusy(true);
                const input = actionStep.input(state.data, resolvedEventChannels);
                const output = await actionStep.action(input, state.data, resolvedEventChannels);
                const next = await actionStep.onOutput(state.data, output, resolvedEventChannels);
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



    // If it's an action step, show a simple placeholder or nothing.
    if (isActionStep) {
        // You can customize this: spinner, skeleton, etc.
        return <div>{busy ? "Processing..." : null}</div>;
    }

    // -----------------------
    // UI STEP HANDLING
    // -----------------------

    const uiStep = step as UiStep<D, any, any>;
    const ViewComponent = uiStep.view;
    const input = uiStep.input(data, resolvedEventChannels);

    const outputHandle: OutputHandle<any> = {
        emit: async (output) => {
            try {
                const next = await uiStep.onOutput(data, output, resolvedEventChannels);
                applyTransition(next);
            } catch (e) {
                console.error("FlowRunner UI step onOutput error:", e);
            }
        },
    };

    return <ViewComponent input={input} output={outputHandle} />;
}
