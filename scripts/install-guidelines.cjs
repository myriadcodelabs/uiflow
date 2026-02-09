"use strict";

const fs = require("fs");
const path = require("path");

const sourcePath = path.resolve(
  __dirname,
  "..",
  "code_generation_guidelines",
  "uiflow_llm_guidelines.md"
);

function installGuidelines(options = {}) {
  const { projectRoot = process.env.INIT_CWD || process.cwd(), verbose = true } = options;

  try {
    if (!fs.existsSync(sourcePath)) {
      if (verbose) {
        console.warn("[uiflow] LLM guidelines source file was not found in this package.");
      }
      return { ok: false, reason: "source-missing" };
    }

    const targetDir = path.join(projectRoot, "code_generation_guidelines");
    const targetPath = path.join(targetDir, "uiflow_llm_guidelines.md");

    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return { ok: true, targetPath };
  } catch (error) {
    if (verbose) {
      console.warn("[uiflow] Failed to install LLM guidelines file:", error.message);
    }
    return { ok: false, reason: error.message };
  }
}

function printNotice(result, contextLabel) {
  const prefix = `[uiflow:${contextLabel}]`;
  if (result.ok) {
    console.log(`${prefix} Installed code_generation_guidelines/uiflow_llm_guidelines.md`);
    console.log(
      `${prefix} Benefit: provides explicit UIFLow generation rules so LLM output is cleaner, safer, and more consistent.`
    );
    return;
  }

  console.warn(`${prefix} Could not auto-install UIFLow LLM guidelines.`);
  console.warn(
    `${prefix} You can install manually anytime with: npx @myriadcodelabs/uiflow install-guidelines`
  );
  console.warn(
    `${prefix} Benefit: this guidance file helps LLMs generate maintainable and correct UIFLow code in your repo.`
  );
}

if (require.main === module) {
  const result = installGuidelines({ verbose: true });
  printNotice(result, "postinstall");
}

module.exports = {
  installGuidelines,
  printNotice,
};
