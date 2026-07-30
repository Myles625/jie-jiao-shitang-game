#!/usr/bin/env node
/**
 * Rewrite absolute root asset paths so the static export works under
 * GitHub Project Pages: https://<user>.github.io/<repo>/
 *
 * vinext's next.config basePath breaks prerender for this app, so we export
 * at "/" then prefix public URLs afterward.
 */
import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist", "client");
const basePath = (process.env.BASE_PATH || "/sapphire-restaurant").replace(
  /\/$/,
  "",
);

const TEXT_EXT = new Set([
  ".html",
  ".rsc",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".map",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewrite(content) {
  const prefix = escapeRegExp(basePath);
  // Prefix root-absolute asset URLs once (also covers css:/assets/... RSC keys).
  let next = content.replace(
    new RegExp(`(?<!${prefix})/assets/`, "g"),
    `${basePath}/assets/`,
  );
  for (const file of [
    "og.png",
    "favicon.svg",
    "file.svg",
    "globe.svg",
    "window.svg",
  ]) {
    next = next.replace(
      new RegExp(`(?<!${prefix})/${escapeRegExp(file)}`, "g"),
      `${basePath}/${file}`,
    );
  }
  // Vite preload helper: return `/` + file  →  return `/repo/` + file
  next = next
    .replaceAll("return`/`+e", `return\`${basePath}/\`+e`)
    .replaceAll('return"/"+e', `return"${basePath}/"+e`)
    .replaceAll("return'/'+e", `return'${basePath}/'+e`);
  return next;
}

async function main() {
  await access(outDir);
  const files = await walk(outDir);
  let changed = 0;
  for (const file of files) {
    if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
    const before = await readFile(file, "utf8");
    const after = rewrite(before);
    if (after !== before) {
      await writeFile(file, after);
      changed += 1;
    }
  }
  await writeFile(path.join(outDir, ".nojekyll"), "");
  console.log(
    `Prepared GitHub Pages export under ${basePath}/ (${changed} files rewritten).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
