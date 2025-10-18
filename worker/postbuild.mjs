import { mkdir, copyFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

async function main() {
  const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const source = resolve(rootDir, "data", "poses.js");
  const target = resolve(rootDir, "dist", "data", "poses.js");
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`[postbuild] Copied poses.js -> ${target}`);
}

main().catch((err) => {
  console.error("[postbuild] Failed to copy poses.js", err);
  process.exitCode = 1;
});
