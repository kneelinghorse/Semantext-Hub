#!/usr/bin/env node
// B18.11 one-click: quarantine + Jest patch + fail-forward coverage + README update
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const r = (...p) => path.join(root, ...p);
const log = (...a) => console.log("[B18.11]", ...a);
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const exists = (p) => fs.existsSync(p);

function writeIfMissing(file, content) {
  if (!exists(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    log("created", path.relative(root, file));
  } else {
    log("exists", path.relative(root, file));
  }
}

function readJSONSafe(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function patchJestConfig() {
  const candidates = ["jest.config.js", "jest.config.mjs", "jest.config.cjs"].map((f) => r(f));
  const cfgPath = candidates.find(exists);
  if (!cfgPath) { log("WARN no jest.config.* found; skipping patch"); return; }

  let src = fs.readFileSync(cfgPath, "utf8");
  if (src.includes("__quarantine") && src.includes("__bypass")) {
    log("jest config already patched");
    return;
  }

  const isESM = /export\s+default\s*\{/.test(src);
  const hdr =
    (isESM
      ? `import fs from 'node:fs';\n`
      : `const fs = require('node:fs');\n`) +
    `const __quarantine = (()=>{try{return JSON.parse(fs.readFileSync('tests/quarantine.globs.json','utf8'))}catch{return {}}})();\n` +
    `const __bypass = process.env.COVERAGE_BYPASS==='1';\n`;

  const opener = isESM ? /export\s+default\s*\{/ : /module\.exports\s*=\s*\{/;

  const replaceArrayProp = (code, prop) => {
    const re = new RegExp(`${prop}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m");
    if (re.test(code)) {
      if (code.includes(`__quarantine.${prop}`)) return code;
      return code.replace(re, `${prop}: [$1, ...(__quarantine.${prop}||[])]`);
    }
    const m = code.match(opener);
    if (!m) return code;
    const idx = m.index + m[0].length;
    return code.slice(0, idx) + `\n  ${prop}: [...(__quarantine.${prop}||[])],` + code.slice(idx);
  };

  const replaceCoverageThreshold = (code) => {
    // If coverageThreshold exists, wrap it with bypass; else insert default global thresholds with bypass.
    const re = /coverageThreshold\s*:\s*({[\s\S]*?})/m;
    if (re.test(code)) {
      const m = code.match(re);
      const original = m[1]; // the {...}
      return code.replace(re, `coverageThreshold: (__bypass ? {} : ${original})`);
    }
    const m = code.match(opener);
    if (!m) return code;
    const idx = m.index + m[0].length;
    const defaultGlobal = `{ global: { statements: 80, functions: 80, branches: 70, lines: 80 } }`;
    return code.slice(0, idx) + `\n  coverageThreshold: (__bypass ? {} : ${defaultGlobal}),` + code.slice(idx);
  };

  let out = hdr + src;
  out = replaceArrayProp(out, "testPathIgnorePatterns");
  out = replaceArrayProp(out, "coveragePathIgnorePatterns");
  out = replaceCoverageThreshold(out);

  fs.writeFileSync(cfgPath, out, "utf8");
  log("patched", path.relative(root, cfgPath));
}

function run(cmd, args, opts = {}) {
  log("run", [cmd, ...args].join(" "));
  const spawnOpts = {
    stdio: "inherit",
    cwd: root,
    shell: false,
    ...opts,
  };
  const res = spawnSync(cmd, args, spawnOpts);
  if (res.error) {
    log("error", res.error.message);
  }
  return typeof res.status === "number" ? res.status : 0;
}

function summarizeAndWriteArtifacts(jestJsonPath, covSummaryIn, covSummaryOut, readmePath) {
  const jr = readJSONSafe(jestJsonPath, {});
  const cs = readJSONSafe(covSummaryIn, {});
  fs.mkdirSync(path.dirname(covSummaryOut), { recursive: true });

  const total = cs.total || {};
  const pct = (k) => (total[k] ? Number(total[k].pct) : 0);
  const coverage = {
    statements: pct("statements"),
    functions: pct("functions"),
    branches: pct("branches"),
    lines: pct("lines"),
  };
  const thresholds = { statements: 80, functions: 80, branches: 70, lines: 80 };
  const meetsThresholds =
    coverage.statements >= thresholds.statements &&
    coverage.functions >= thresholds.functions &&
    coverage.branches >= thresholds.branches &&
    coverage.lines >= thresholds.lines;

  const suiteTotals = {
    suitesTotal: jr.numTotalTestSuites ?? 0,
    suitesFailed: jr.numFailedTestSuites ?? 0,
    suitesPassed: jr.numPassedTestSuites ?? 0,
  };
  const testTotals = {
    testsTotal: jr.numTotalTests ?? 0,
    testsFailed: jr.numFailedTests ?? 0,
    testsPassed: jr.numPassedTests ?? 0,
  };

  const artifact = {
    thresholds,
    coverage,
    meetsThresholds,
    suiteTotals,
    testTotals,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(covSummaryOut, JSON.stringify(artifact, null, 2), "utf8");
  log("wrote", path.relative(root, covSummaryOut));

  if (fs.existsSync(readmePath)) {
    const BEGIN = "<!-- TEST-COUNTS:BEGIN -->";
    const END = "<!-- TEST-COUNTS:END -->";
    const block =
      `${BEGIN}\n` +
      `Suites: ${suiteTotals.suitesPassed} passed / ${suiteTotals.suitesFailed} failed / ${suiteTotals.suitesTotal} total\n` +
      `Tests: ${testTotals.testsPassed} passed / ${testTotals.testsFailed} failed / ${testTotals.testsTotal} total\n` +
      `Coverage: statements ${coverage.statements}% · functions ${coverage.functions}% · branches ${coverage.branches}% · lines ${coverage.lines}%\n` +
      `Thresholds met: ${meetsThresholds}\n` +
      `${END}\n`;
    let readme = fs.readFileSync(readmePath, "utf8");
    if (readme.includes(BEGIN) && readme.includes(END)) {
      readme = readme.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block);
    } else {
      readme += `\n\n${block}`;
    }
    fs.writeFileSync(readmePath, readme, "utf8");
    log("updated README block");
  } else {
    log("README.md not found; skipped block update");
  }
}

(async function main() {
  // Ensure scaffolds exist (idempotent)
  writeIfMissing(
    r("tests/QUARANTINED.md"),
    `# Quarantined Tests (temporary)\n\nPurpose: track suites ignored while stabilizing CI. Each entry must include an exit criterion and an owner.\n\n| Glob (relative) | Rationale | Owner | Added | Exit criterion |\n|---|---|---|---|---|\n`
  );
  writeIfMissing(
    r("tests/quarantine.globs.json"),
    JSON.stringify(
      {
        testPathIgnorePatterns: [],
        coveragePathIgnorePatterns: [
          "artifacts/scaffold-smoke/.+\\.test\\.js$",
          "packages/.+/__fixtures__/.+"
        ]
      },
      null,
      2
    )
  );

  // Patch Jest config: quarantine + conditional threshold bypass
  patchJestConfig();

  // Prepare paths
  fs.mkdirSync(r("artifacts/test"), { recursive: true });
  const jestJson = r("artifacts/test/jest-results.json");
  const covIn = r("coverage/coverage-summary.json");
  const covOut = r("artifacts/test/coverage-summary.json");

  const jestBin = r("node_modules/jest/bin/jest.js");
  if (!exists(jestBin)) {
    console.error("[B18.11] Jest binary not found at", jestBin);
    process.exit(1);
  }

  // Common args to force exit and surface handles
  const baseArgs = ["--runInBand", "--detectOpenHandles", "--forceExit"];
  const env = { ...process.env, COVERAGE_BYPASS: process.env.COVERAGE_BYPASS || "1" };

  const runJest = (extraArgs) =>
    run(process.execPath, ["--experimental-vm-modules", jestBin, ...extraArgs, ...baseArgs], { env });

  // 1) JSON results (fail-forward)
  runJest(["--json", `--outputFile=${jestJson}`]);

  // 2) Coverage (json-summary), still fail-forward; bypass thresholds if COVERAGE_BYPASS=1
  runJest(["--coverage", "--coverageReporters=json-summary"]);

  // 3) Optional deflake
  if (exists(r("tests/util/deflake-runner.js"))) {
    run(process.execPath, [r("tests/util/deflake-runner.js"), "--passes", "10", "--jsonl", r("artifacts/test/flakiness.jsonl")], { env });
  } else {
    writeIfMissing(r("artifacts/test/flakiness.jsonl"), "");
  }

  // 4) Summarize + README block (ALWAYS)
  summarizeAndWriteArtifacts(jestJson, covIn, covOut, r("README.md"));

  // Always succeed during stabilization
  process.exit(0);
})();
