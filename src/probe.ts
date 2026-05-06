import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SKIPPED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit",
  "out", "coverage", ".turbo", ".vercel", ".cache", ".astro",
]);
const SCANNED_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const MAX_FILE_BYTES = 512 * 1024;

const IMPORT_RE = /(?:^|[\s;])import\s+(?:[^"'`]+\s+from\s+)?["']([^"'`]+)["']/gm;
const REQUIRE_RE = /\brequire\(\s*["']([^"'`]+)["']\s*\)/g;

export interface ProbeResult {
  /** dep name → number of import sites + number of files */
  usage: Map<string, { sites: number; files: number }>;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!SCANNED_EXT.has(ext)) continue;
      try {
        if (statSync(full).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }
      out.push(full);
    }
  }
}

function rootPackage(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  if (spec.startsWith("node:")) return null;
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return spec.split("/")[0] ?? null;
}

export async function probe(repoRoot: string): Promise<ProbeResult> {
  const usage = new Map<string, { sites: number; files: number }>();
  if (!existsSync(repoRoot)) return { usage };

  const files: string[] = [];
  await walk(repoRoot, files);

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const seenInFile = new Set<string>();
    const collect = (re: RegExp) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const spec = m[1];
        if (!spec) continue;
        const pkg = rootPackage(spec);
        if (!pkg) continue;
        const cur = usage.get(pkg) ?? { sites: 0, files: 0 };
        cur.sites += 1;
        if (!seenInFile.has(pkg)) {
          cur.files += 1;
          seenInFile.add(pkg);
        }
        usage.set(pkg, cur);
      }
    };
    collect(IMPORT_RE);
    collect(REQUIRE_RE);
  }

  return { usage };
}

export function isUsed(probe: ProbeResult, dep: string): boolean {
  const u = probe.usage.get(dep);
  return !!u && u.sites > 0;
}
