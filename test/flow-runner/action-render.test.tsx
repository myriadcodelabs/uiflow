import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defineFlow, FlowRunner } from "../../src/flow";
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
});
