import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
    type FlowChannel,
    type OutputHandle,
    createFlowChannel,
    defineFlow,
    FlowRunner,
    type Updater,
} from "../src/flow";

type DisplayViewProps = {
    input: { value: string };
    output: OutputHandle<never>;
};

function DisplayView(props: DisplayViewProps) {
    return <div>{props.input.value}</div>;
}

type ButtonOutput = { action: "go" } | { action: "inc" };

type ButtonViewProps = {
    input: { value: string; action: "go" | "inc" };
    output: OutputHandle<ButtonOutput>;
};

function ButtonView(props: ButtonViewProps) {
    return (
        <div>
            <div>{props.input.value}</div>
            <button onClick={() => props.output.emit({ action: props.input.action })}>
                trigger
            </button>
        </div>
    );
}

function createTrackedChannel(initial: number): {
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

describe("FlowRunner", () => {
    it("auto-runs action step and transitions", async () => {
        type Data = { value: number };
        const flow = defineFlow<Data>(
            {
                startAction: {
                    input: (data) => ({ seed: data.value }),
                    action: ({ seed }, data) => {
                        data.value = seed + 1;
                        return data.value;
                    },
                    onOutput: () => "done",
                },
                done: {
                    input: (data) => ({ value: `v:${data.value}` }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "startAction" }
        );

        render(<FlowRunner flow={flow} initialData={{ value: 1 }} />);
        expect(await screen.findByText("v:2")).toBeInTheDocument();
    });

    it("handles UI output emission and transitions", async () => {
        type Data = { done: boolean };
        const flow = defineFlow<Data>(
            {
                ask: {
                    input: () => ({ value: "ask", action: "go" as const }),
                    view: ButtonView,
                    onOutput: (_, output) => {
                        if (output.action === "go") return "done";
                    },
                },
                done: {
                    input: () => ({ value: "done" }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "ask" }
        );

        const user = userEvent.setup();
        render(<FlowRunner flow={flow} initialData={{ done: false }} />);
        await user.click(screen.getByRole("button", { name: "trigger" }));
        expect(await screen.findByText("done")).toBeInTheDocument();
    });

    it("stays on same step when transition target is unknown", async () => {
        type Data = { count: number };
        const flow = defineFlow<Data>(
            {
                counter: {
                    input: (data) => ({ value: `count:${data.count}`, action: "inc" as const }),
                    view: ButtonView,
                    onOutput: (data, output) => {
                        if (output.action === "inc") {
                            data.count += 1;
                            return "missingStep";
                        }
                    },
                },
            },
            { start: "counter" }
        );

        const user = userEvent.setup();
        render(<FlowRunner flow={flow} initialData={{ count: 0 }} />);
        await user.click(screen.getByRole("button", { name: "trigger" }));

        expect(await screen.findByText("count:1")).toBeInTheDocument();
    });

    it("stays on same step when onOutput returns void", async () => {
        type Data = { count: number };
        const flow = defineFlow<Data>(
            {
                counter: {
                    input: (data) => ({ value: `count:${data.count}`, action: "inc" as const }),
                    view: ButtonView,
                    onOutput: (data, output) => {
                        if (output.action === "inc") {
                            data.count += 1;
                            return;
                        }
                    },
                },
            },
            { start: "counter" }
        );

        const user = userEvent.setup();
        render(<FlowRunner flow={flow} initialData={{ count: 0 }} />);
        await user.click(screen.getByRole("button", { name: "trigger" }));

        expect(await screen.findByText("count:1")).toBeInTheDocument();
    });

    it("re-renders when subscribed channel emits", async () => {
        type Data = {};
        const counter = createFlowChannel<number>(0);
        const flow = defineFlow<Data>(
            {
                watch: {
                    input: (_, events) => ({ value: `count:${events?.counter.get() ?? -1}` }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "watch" }
        );

        render(<FlowRunner flow={flow} initialData={{}} eventChannels={{ counter }} />);
        expect(screen.getByText("count:0")).toBeInTheDocument();

        act(() => {
            counter.emit((n) => n + 1);
        });

        expect(await screen.findByText("count:1")).toBeInTheDocument();
    });

    it("uses sticky strategy by default for same channel key replacements", async () => {
        type Data = {};
        const channelA = createFlowChannel<number>(1);
        const channelB = createFlowChannel<number>(100);
        const flow = defineFlow<Data>(
            {
                watch: {
                    input: (_, events) => ({ value: `count:${events?.counter.get() ?? -1}` }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "watch" }
        );

        const ui = render(
            <FlowRunner flow={flow} initialData={{}} eventChannels={{ counter: channelA }} />
        );

        expect(screen.getByText("count:1")).toBeInTheDocument();

        ui.rerender(
            <FlowRunner flow={flow} initialData={{}} eventChannels={{ counter: channelB }} />
        );

        expect(screen.getByText("count:1")).toBeInTheDocument();

        act(() => {
            channelB.emit(101);
        });
        expect(screen.getByText("count:1")).toBeInTheDocument();

        act(() => {
            channelA.emit(2);
        });
        expect(await screen.findByText("count:2")).toBeInTheDocument();
    });

    it("uses replace strategy when explicitly requested", async () => {
        type Data = {};
        const channelA = createFlowChannel<number>(1);
        const channelB = createFlowChannel<number>(100);
        const flow = defineFlow<Data>(
            {
                watch: {
                    input: (_, events) => ({ value: `count:${events?.counter.get() ?? -1}` }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "watch" }
        );

        const ui = render(
            <FlowRunner
                flow={flow}
                initialData={{}}
                eventChannels={{ counter: channelA }}
                eventChannelsStrategy="replace"
            />
        );

        expect(screen.getByText("count:1")).toBeInTheDocument();

        ui.rerender(
            <FlowRunner
                flow={flow}
                initialData={{}}
                eventChannels={{ counter: channelB }}
                eventChannelsStrategy="replace"
            />
        );

        expect(screen.getByText("count:100")).toBeInTheDocument();

        act(() => {
            channelB.emit(101);
        });
        expect(await screen.findByText("count:101")).toBeInTheDocument();
    });

    it("deduplicates equivalent channel maps to avoid re-subscribe churn", async () => {
        type Data = {};
        const tracked = createTrackedChannel(0);
        const flow = defineFlow<Data>(
            {
                watch: {
                    input: (_, events) => ({ value: `count:${events?.counter.get() ?? -1}` }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "watch" }
        );

        const ui = render(
            <FlowRunner flow={flow} initialData={{}} eventChannels={{ counter: tracked.channel }} />
        );

        await waitFor(() => {
            expect(tracked.stats.activeSubscribers()).toBe(1);
        });
        expect(tracked.stats.subscribeCalls).toBe(1);

        ui.rerender(
            <FlowRunner flow={flow} initialData={{}} eventChannels={{ counter: tracked.channel }} />
        );

        expect(tracked.stats.activeSubscribers()).toBe(1);
        expect(tracked.stats.subscribeCalls).toBe(1);
        expect(tracked.stats.unsubscribeCalls).toBe(0);

        ui.unmount();
        expect(tracked.stats.activeSubscribers()).toBe(0);
        expect(tracked.stats.unsubscribeCalls).toBe(1);
    });

    it("transitions to mapped step when channelTransitions resolver returns a step", async () => {
        type Data = {};
        const refresh = createFlowChannel<number>(0);
        const flow = defineFlow<Data>(
            {
                idle: {
                    input: () => ({ value: "idle" }),
                    view: DisplayView,
                    onOutput: () => {},
                },
                refreshed: {
                    input: () => ({ value: "refreshed" }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            {
                start: "idle",
                channelTransitions: {
                    refresh: () => "refreshed",
                },
            }
        );

        render(<FlowRunner flow={flow} initialData={{}} eventChannels={{ refresh }} />);
        expect(screen.getByText("idle")).toBeInTheDocument();

        act(() => {
            refresh.emit((n) => n + 1);
        });

        expect(await screen.findByText("refreshed")).toBeInTheDocument();
    });

    it("supports conditional channelTransitions via resolver function", async () => {
        type Data = {};
        const refresh = createFlowChannel<number>(0);
        const flow = defineFlow<Data>(
            {
                idle: {
                    input: () => ({ value: "idle" }),
                    view: DisplayView,
                    onOutput: () => {},
                },
                refreshed: {
                    input: () => ({ value: "refreshed" }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            {
                start: "idle",
                channelTransitions: {
                    refresh: ({ events }) =>
                        (events?.refresh.get() ?? 0) >= 2 ? "refreshed" : undefined,
                },
            }
        );

        render(<FlowRunner flow={flow} initialData={{}} eventChannels={{ refresh }} />);
        expect(screen.getByText("idle")).toBeInTheDocument();

        act(() => {
            refresh.emit((n) => n + 1);
        });
        expect(screen.getByText("idle")).toBeInTheDocument();

        act(() => {
            refresh.emit((n) => n + 1);
        });
        expect(await screen.findByText("refreshed")).toBeInTheDocument();
    });
});
