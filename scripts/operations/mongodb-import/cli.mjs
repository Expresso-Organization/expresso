export function parseImportArgs(argv) {
  let mode = "dry-run";
  let explicitMode = false;
  let reportPath;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--dry-run", "--apply", "--verify-only"].includes(value)) {
      if (explicitMode) throw new Error("choose exactly one import mode");
      mode = value.slice(2);
      explicitMode = true;
      continue;
    }
    if (value === "--report") {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith("--")) throw new Error("--report requires a path");
      reportPath = candidate;
      index += 1;
      continue;
    }
    throw new Error(`unknown import argument: ${value}`);
  }
  return { mode, reportPath };
}
