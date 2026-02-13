import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFlowChannel, defineFlow, FlowRunner } from "../../src/flow";
import { DisplayView, createTrackedChannel } from "../helpers";

describe("FlowRunner channels", () => {
    it("re-renders when subscribed channel emits", async () => {
        type Data = {};
        const counter = createFlowChannel<number>(0);
        const flow = defineFlow<Data>(
            {
                watch: {
                    input: (_domain, _internal, events) => ({ value: `count:${events?.counter?.get() ?? -1}` }),
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
                    input: (_domain, _internal, events) => ({ value: `count:${events?.counter?.get() ?? -1}` }),
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
                    input: (_domain, _internal, events) => ({ value: `count:${events?.counter?.get() ?? -1}` }),
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
                    input: (_domain, _internal, events) => ({ value: `count:${events?.counter?.get() ?? -1}` }),
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
                        (events?.refresh?.get() ?? 0) >= 2 ? "refreshed" : undefined,
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
