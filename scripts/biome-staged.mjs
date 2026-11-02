import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

// Resolve the actual binary instead of the .cmd shim
/** @param {string} repoRoot */
function resolveBiome(repoRoot) {
  const binDir = path.join(repoRoot, "node_modules", ".bin");
  if (process.platform === "win32") {
    // Find the platform-specific package
    const pkg = fs
      .readdirSync(path.join(repoRoot, "node_modules", "@biomejs"))
      .find((p) => p.startsWith("cli-win32"));
    if (pkg) {
      return path.join(repoRoot, "node_modules", "@biomejs", pkg, "biome.exe");
    }
  }
  // Fallback: strip .cmd/.ps1 from the .bin entry
  const entry = fs
    .readdirSync(binDir)
    .find(
      (f) =>
        f.startsWith("biome") && !f.endsWith(".cmd") && !f.endsWith(".ps1"),
    );
  return path.join(binDir, entry ?? "biome");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const biomeBin = resolveBiome(repoRoot);

const getStagedFiles = () => {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith(".githooks/"));
};

const files = getStagedFiles();
if (files.length === 0) {
  process.exit(0);
}
console.log(biomeBin);
execFileSync(
  biomeBin,
  [
    "check",
    "--write",
    "--unsafe",
    "--assist-enabled=false",
    "--files-ignore-unknown=true",
    "--no-errors-on-unmatched",
    ...files,
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

execFileSync("git", ["add", "--", ...files], {
  cwd: repoRoot,
  stdio: "inherit",
});
