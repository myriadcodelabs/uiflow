"use strict";

const fs = require("fs");
const path = require("path");

const sourcePath = path.resolve(
  __dirname,
  "..",
  "code_generation_guidelines",
  "uiflow_llm_guidelines.md"
);

const skillSourcePath = path.resolve(__dirname, "..", "skills", "uiflow", "SKILL.md");

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

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

    copyFile(sourcePath, targetPath);
    return { ok: true, targetPath };
  } catch (error) {
    if (verbose) {
      console.warn("[uiflow] Failed to install LLM guidelines file:", error.message);
    }
    return { ok: false, reason: error.message };
  }
}

function installSkills(options = {}) {
  const { projectRoot = process.env.INIT_CWD || process.cwd(), verbose = true } = options;

  try {
    if (!fs.existsSync(skillSourcePath)) {
      if (verbose) {
        console.warn("[uiflow] Skill source file was not found in this package.");
      }
      return { ok: false, reason: "source-missing", targets: [] };
    }

    const targets = [
      path.join(projectRoot, ".codex", "skills", "uiflow", "SKILL.md"),
      path.join(projectRoot, ".agents", "skills", "uiflow", "SKILL.md"),
    ];

    for (const targetPath of targets) {
      copyFile(skillSourcePath, targetPath);
    }

    return { ok: true, targets };
  } catch (error) {
    if (verbose) {
      console.warn("[uiflow] Failed to install skill files:", error.message);
    }
    return { ok: false, reason: error.message, targets: [] };
  }
}

function installAgentAssets(options = {}) {
  const guidelines = installGuidelines(options);
  const skills = installSkills(options);

  return {
    ok: guidelines.ok && skills.ok,
    guidelines,
    skills,
  };
}

function printNotice(result, contextLabel) {
  const prefix = `[uiflow:${contextLabel}]`;
  const guidelines = result.guidelines || result;
  const skills = result.skills;

  if (!guidelines.skipped) {
    if (guidelines.ok) {
      console.log(`${prefix} Installed code_generation_guidelines/uiflow_llm_guidelines.md`);
    } else {
      console.warn(`${prefix} Could not auto-install UIFlow LLM guidelines.`);
      console.warn(
        `${prefix} You can install manually anytime with: npx @myriadcodelabs/uiflow install-guidelines`
      );
    }
  }

  if (skills) {
    if (skills.ok) {
      console.log(`${prefix} Installed local skill files for Codex-style agents.`);
    } else {
      console.warn(`${prefix} Could not auto-install UIFlow skill files.`);
      console.warn(`${prefix} You can install manually anytime with: npx @myriadcodelabs/uiflow install-skills`);
    }
  }

  console.log(
    `${prefix} Benefit: agent guidance helps generate maintainable and correct UIFlow code in your repo.`
  );
}

if (require.main === module) {
  const result = installAgentAssets({ verbose: true });
  printNotice(result, "postinstall");
}

module.exports = {
  installAgentAssets,
  installGuidelines,
  installSkills,
  printNotice,
};
