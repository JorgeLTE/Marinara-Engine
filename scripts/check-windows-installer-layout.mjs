import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const installerPath = resolve(REPO_ROOT, "win/installer/installer.nsi");

try {
  const content = await readFile(installerPath, "utf8");

  const unsafePatterns = [
    {
      pattern: /\bgit clone\b[^\r\n]*"\$INSTDIR\\repo-temp"/i,
      message: 'Initial clone target must not be under "$INSTDIR".',
    },
    {
      pattern: /\brobocopy\s+"\$INSTDIR\\repo-temp"\s+"\$INSTDIR"\b/i,
      message: 'Do not robocopy from "$INSTDIR\\repo-temp" into its parent "$INSTDIR".',
    },
  ];

  const failures = unsafePatterns.filter(({ pattern }) => pattern.test(content));

  if (failures.length > 0) {
    console.error("Unsafe Windows installer staging layout detected:");
    for (const failure of failures) {
      console.error(`- ${failure.message}`);
    }
    console.error("Stage repository clones outside the final install directory.");
    process.exit(1);
  }

  console.log("Windows installer staging layout is safe.");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
