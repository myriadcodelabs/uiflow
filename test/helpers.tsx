import React from "react";
import {
    type ActionFallbackViewProps,
    type FlowChannel,
    type OutputHandle,
    type Updater,
} from "../src/flow";

export type DisplayViewProps = {
    input: { value: string };
    output: OutputHandle<never>;
};

export function DisplayView(props: DisplayViewProps) {
    return <div>{props.input.value}</div>;
}

export type ButtonOutput = { action: "go" } | { action: "inc" };

export type ButtonViewProps = {
    input: { value: string; action: "go" | "inc" };
    output: OutputHandle<ButtonOutput>;
};

export function ButtonView(props: ButtonViewProps) {
    return (
        <div>
            <div>{props.input.value}</div>
            <button onClick={() => props.output.emit({ action: props.input.action })}>
                trigger
            </button>
        </div>
    );
}

export function SavingView(props: ActionFallbackViewProps<any, { value: string }>) {
    return <div>{`saving:${props.input.value}`}</div>;
}

export function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

export function createTrackedChannel(initial: number): {
    channel: FlowChannel<number>;
    stats: {
        subscribeCalls: number;
        unsubscribeCalls: number;
        activeSubscribers: () => number;
    };
} {
    let value = initial;
    const listeners = new Set<() => void>();
    const stats = {
        subscribeCalls: 0,
        unsubscribeCalls: 0,
        activeSubscribers: () => listeners.size,
    };

    const channel: FlowChannel<number> = {
        get: () => value,
        emit: (update: Updater<number>) => {
            value = typeof update === "function" ? update(value) : update;
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener: () => void) => {
            stats.subscribeCalls += 1;
            listeners.add(listener);
            return () => {
                if (listeners.delete(listener)) {
                    stats.unsubscribeCalls += 1;
                }
            };
        },
    };

    return { channel, stats };
}
