import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFlowChannel, defineFlow, FlowRunner } from "../../src/flow";
import { ButtonView, DisplayView, SavingView, createDeferred } from "../helpers";

describe("FlowRunner action render", () => {
    it("renders nothing by default while action step is running", async () => {
        type Data = { value: string };
        const deferred = createDeferred<void>();
        const flow = defineFlow<Data>(
            {
                start: {
                    input: (data) => ({ value: data.value, action: "go" as const }),
                    view: ButtonView,
                    onOutput: () => "saving",
                },
                saving: {
                    input: (data) => ({ value: data.value }),
                    action: async (_input, data) => {
                        await deferred.promise;
                        data.value = "done";
                        return { ok: true };
                    },
                    onOutput: () => "done",
                },
                done: {
                    input: (data) => ({ value: data.value }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "start" }
        );

        const user = userEvent.setup();
        const ui = render(<FlowRunner flow={flow} initialData={{ value: "start" }} />);
        await user.click(screen.getByRole("button", { name: "trigger" }));

        expect(ui.container.textContent).toBe("");

        await act(async () => {
            deferred.resolve();
            await deferred.promise;
        });

        expect(await screen.findByText("done")).toBeInTheDocument();
    });

    it("preserves previous UI while action is running when configured", async () => {
        type Data = { value: string };
        const deferred = createDeferred<void>();
        const flow = defineFlow<Data>(
            {
                start: {
                    input: (data) => ({ value: data.value, action: "go" as const }),
                    view: ButtonView,
                    onOutput: () => "saving",
                },
                saving: {
                    input: (data) => ({ value: data.value }),
                    action: async (_input, data) => {
                        await deferred.promise;
                        data.value = "done";
                        return { ok: true };
                    },
                    onOutput: () => "done",
                    render: { mode: "preserve-previous" },
                },
                done: {
                    input: (data) => ({ value: data.value }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "start" }
        );

        const user = userEvent.setup();
        render(<FlowRunner flow={flow} initialData={{ value: "start" }} />);
        await user.click(screen.getByRole("button", { name: "trigger" }));

        expect(screen.getByText("start")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "trigger" })).toBeInTheDocument();

        await act(async () => {
            deferred.resolve();
            await deferred.promise;
        });

        expect(await screen.findByText("done")).toBeInTheDocument();
    });

    it("renders fallback view while action is running when configured", async () => {
        type Data = { value: string };
        const deferred = createDeferred<void>();
        const flow = defineFlow<Data>(
            {
                start: {
                    input: (data) => ({ value: data.value, action: "go" as const }),
                    view: ButtonView,
                    onOutput: () => "saving",
                },
                saving: {
                    input: (data) => ({ value: data.value }),
                    action: async (_input, data) => {
                        await deferred.promise;
                        data.value = "done";
                        return { ok: true };
                    },
                    onOutput: () => "done",
                    render: { mode: "fallback", view: SavingView },
                },
                done: {
                    input: (data) => ({ value: data.value }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            { start: "start" }
        );

        const user = userEvent.setup();
        render(<FlowRunner flow={flow} initialData={{ value: "start" }} />);
        await user.click(screen.getByRole("button", { name: "trigger" }));

        expect(screen.getByText("saving:start")).toBeInTheDocument();

        await act(async () => {
            deferred.resolve();
            await deferred.promise;
        });

        expect(await screen.findByText("done")).toBeInTheDocument();
    });

    it.skip("ignores late completion from an outdated action step after the flow already moved on", async () => {
        type Data = { value: string };
        const save = createDeferred<void>();
        const cancel = createFlowChannel<number>(0);
        const flow = defineFlow<Data>(
            {
                saving: {
                    input: (data) => ({ value: data.value }),
                    action: async (_input, data) => {
                        await save.promise;
                        data.value = "saved";
                        return { ok: true };
                    },
                    onOutput: () => "done",
                    render: { mode: "fallback", view: SavingView },
                },
                cancelled: {
                    input: () => ({ value: "cancelled" }),
                    view: DisplayView,
                    onOutput: () => {},
                },
                done: {
                    input: (data) => ({ value: data.value }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            {
                start: "saving",
                channelTransitions: {
                    cancel: () => "cancelled",
                },
            }
        );

        // TODO: Late async action completions can still drive the flow after a newer transition.
        // Intended solution: expose the live current step to action/onOutput, either directly
        // or through a runtime helper (for example getCurrentStep), so consumers can opt in to
        // ignoring outdated completions without the library forcing cancellation semantics.
        render(<FlowRunner flow={flow} initialData={{ value: "start" }} eventChannels={{ cancel }} />);
        expect(screen.getByText("saving:start")).toBeInTheDocument();

        act(() => {
            cancel.emit((n) => n + 1);
        });
        expect(await screen.findByText("cancelled")).toBeInTheDocument();

        await act(async () => {
            save.resolve();
            await save.promise;
        });

        expect(screen.getByText("cancelled")).toBeInTheDocument();
    });
});
