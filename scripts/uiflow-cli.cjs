#!/usr/bin/env node
"use strict";

const { installAgentAssets, installGuidelines, installSkills, printNotice } = require("./install-guidelines.cjs");

function printHelp() {
  console.log("UIFlow CLI");
  console.log("");
  console.log("Commands:");
  console.log("  install-agent-assets Copy UIFlow guidelines and skill files into this project");
  console.log("  install-guidelines   Copy UIFlow LLM guidelines to ./code_generation_guidelines");
  console.log("  install-skills       Copy UIFlow skill files to ./.codex/skills and ./.agents/skills");
}

function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "install-agent-assets") {
    const result = installAgentAssets({ verbose: true });
    printNotice(result, "cli");
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "install-guidelines") {
    const result = installGuidelines({ verbose: true });
    printNotice(result, "cli");
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "install-skills") {
    const result = installSkills({ verbose: true });
    printNotice({ guidelines: { ok: true, skipped: true }, skills: result }, "cli");
    process.exit(result.ok ? 0 : 1);
  }

  console.error(`[uiflow:cli] Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main();
