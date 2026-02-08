import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defineFlow, FlowRunner } from "../../src/flow";
import { ButtonView, DisplayView } from "../helpers";

describe("FlowRunner core", () => {
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
});
