#!/usr/bin/env node
"use strict";

const { installGuidelines, printNotice } = require("./install-guidelines.cjs");

function printHelp() {
  console.log("UIFlow CLI");
  console.log("");
  console.log("Commands:");
  console.log("  install-guidelines   Copy UIFLow LLM guidelines to ./code_generation_guidelines");
}

function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "install-guidelines") {
    const result = installGuidelines({ verbose: true });
    printNotice(result, "cli");
    process.exit(result.ok ? 0 : 1);
  }

  console.error(`[uiflow:cli] Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main();
