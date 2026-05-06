import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { log } from "./util/log.js";

export interface BootstrapResult {
  autoskillsVersion: string;
  candidates: BootstrapCandidate[];
  source: "autoskills" | "stub";
}

export interface BootstrapCandidate {
  id: string;
  reason: string;
}

const PINNED_AUTOSKILLS_VERSION = "0.x";

const STACK_TO_SKILL: Record<string, string[]> = {
  react: ["react"],
  next: ["nextjs"],
  vue: ["vue"],
  nuxt: ["nuxt"],
  svelte: ["svelte"],
  "@angular/core": ["angular"],
  astro: ["astro"],
  tailwindcss: ["tailwind"],
  typescript: ["typescript"],
  express: ["express"],
  hono: ["hono"],
  "@nestjs/core": ["nestjs"],
  prisma: ["prisma"],
  "drizzle-orm": ["drizzle"],
  zod: ["zod"],
  vitest: ["vitest"],
  "@playwright/test": ["playwright"],
  "@supabase/supabase-js": ["supabase"],
  "better-auth": ["better-auth"],
  "@clerk/clerk-sdk-node": ["clerk"],
  "@clerk/nextjs": ["clerk"],
  stripe: ["stripe"],
  "react-hook-form": ["react-hook-form"],
  three: ["threejs"],
  gsap: ["gsap"],
  expo: ["expo"],
  "react-native": ["react-native"],
};

export async function bootstrap(repoRoot: string): Promise<BootstrapResult> {
  const pkgPath = path.join(repoRoot, "package.json");
  if (!existsSync(pkgPath)) {
    log.warn(`no package.json at ${repoRoot}; bootstrap returns empty candidate list`);
    return { autoskillsVersion: PINNED_AUTOSKILLS_VERSION, candidates: [], source: "stub" };
  }

  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  const seen = new Set<string>();
  const candidates: BootstrapCandidate[] = [];
  for (const dep of Object.keys(deps)) {
    const skills = STACK_TO_SKILL[dep];
    if (!skills) continue;
    for (const id of skills) {
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ id, reason: `dep:${dep}` });
    }
  }

  return { autoskillsVersion: PINNED_AUTOSKILLS_VERSION, candidates, source: "stub" };
}
