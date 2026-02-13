import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defineFlow, FlowRunner } from "../../src/flow";
import { ButtonView, DisplayView } from "../helpers";

describe("FlowRunner core", () => {
    it("uses flow createInternalData for internal state", async () => {
        type Domain = { value: string };
        type Internal = { suffix: string };
        const flow = defineFlow<Domain, Internal>(
            {
                show: {
                    input: (domain, internal) => ({ value: `${domain.value}${internal.suffix}` }),
                    view: DisplayView,
                    onOutput: () => {},
                },
            },
            {
                start: "show",
                createInternalData: () => ({ suffix: "-internal" }),
            }
        );

        render(<FlowRunner flow={flow} initialData={{ value: "from-flow" }} />);
        expect(await screen.findByText("from-flow-internal")).toBeInTheDocument();
    });

    it("auto-runs action step and transitions", async () => {
        type Domain = { value: number };
        type Internal = {};
        const flow = defineFlow<Domain, Internal>(
            {
                startAction: {
                    input: (domain) => ({ seed: domain.value }),
                    action: ({ seed }, domain) => {
                        domain.value = seed + 1;
                        return domain.value;
                    },
                    onOutput: () => "done",
                },
                done: {
                    input: (domain) => ({ value: `v:${domain.value}` }),
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
        type Domain = { done: boolean };
        type Internal = {};
        const flow = defineFlow<Domain, Internal>(
            {
                ask: {
                    input: () => ({ value: "ask", action: "go" as const }),
                    view: ButtonView,
                    onOutput: (_domain, _internal, output) => {
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
        type Domain = { count: number };
        type Internal = {};
        const flow = defineFlow<Domain, Internal>(
            {
                counter: {
                    input: (domain) => ({ value: `count:${domain.count}`, action: "inc" as const }),
                    view: ButtonView,
                    onOutput: (domain, _internal, output) => {
                        if (output.action === "inc") {
                            domain.count += 1;
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
        type Domain = { count: number };
        type Internal = {};
        const flow = defineFlow<Domain, Internal>(
            {
                counter: {
                    input: (domain) => ({ value: `count:${domain.count}`, action: "inc" as const }),
                    view: ButtonView,
                    onOutput: (domain, _internal, output) => {
                        if (output.action === "inc") {
                            domain.count += 1;
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
