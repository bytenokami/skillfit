import { readFile, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { log } from "./util/log.js";

export type StackKind = "ts" | "unity" | "go" | "python" | "infra";

export interface BootstrapCandidate {
  id: string;
  reason: string;
  stack: StackKind;
  /** non-null only when probe-drop is meaningful (ts + python) */
  importRoot: string | null;
}

export interface BootstrapResult {
  autoskillsVersion: string;
  stacks: StackKind[];
  candidates: BootstrapCandidate[];
  source: "autoskills" | "stub";
}

const PINNED_AUTOSKILLS_VERSION = "0.x";

const TS_STACK: Record<string, string[]> = {
  react: ["react"], next: ["nextjs"], vue: ["vue"], nuxt: ["nuxt"], svelte: ["svelte"],
  "@angular/core": ["angular"], astro: ["astro"], tailwindcss: ["tailwind"], typescript: ["typescript"],
  express: ["express"], hono: ["hono"], "@nestjs/core": ["nestjs"],
  prisma: ["prisma"], "drizzle-orm": ["drizzle"], zod: ["zod"],
  vitest: ["vitest"], "@playwright/test": ["playwright"],
  "@supabase/supabase-js": ["supabase"], "better-auth": ["better-auth"],
  "@clerk/clerk-sdk-node": ["clerk"], "@clerk/nextjs": ["clerk"],
  stripe: ["stripe"], "react-hook-form": ["react-hook-form"],
  three: ["threejs"], gsap: ["gsap"], expo: ["expo"], "react-native": ["react-native"],
  "discord.js": ["discord-js"], "@modelcontextprotocol/sdk": ["mcp-sdk"],
};

const UNITY_STACK: Record<string, string> = {
  "com.cysharp.unitask": "unity-unitask",
  "com.neuecc.unirx": "unity-unirx",
  "com.unity.addressables": "unity-addressables",
  "com.unity.2d.animation": "unity-anima2d",
  "com.unity.localization": "unity-localization",
  "com.unity.timeline": "unity-timeline",
  "com.unity.purchasing": "unity-purchasing",
  "com.unity.recorder": "unity-recorder",
  "com.unity.mobile.notifications": "unity-mobile-notifications",
  "com.unity.ai.navigation": "unity-ai-navigation",
  "com.unity.ugui": "unity-ugui",
  "com.grpc.unity": "unity-grpc",
  "com.google.firebase.app": "unity-firebase",
  "com.google.firebase.analytics": "unity-firebase",
  "com.google.firebase.auth": "unity-firebase",
  "com.google.firebase.crashlytics": "unity-firebase",
  "com.google.firebase.messaging": "unity-firebase",
  "com.google.signin": "unity-google-signin",
  "com.lupidan.apple-signin-unity": "unity-apple-signin",
  "com.coffee.softmask-for-ugui": "unity-softmask",
  "com.coffee.ui-effect": "unity-ui-effect",
  "com.coffee.ui-particle": "unity-ui-particle",
};

const UNITY_PLUGIN_DIR_HEURISTICS: Record<string, string> = {
  Adjust: "unity-adjust-sdk",
  AppsFlyer: "unity-appsflyer",
  Facebook: "unity-facebook-sdk",
};

const UNITY_CSPROJ_HEURISTICS: Record<string, string> = {
  AdjustSdk: "unity-adjust-sdk",
  AppsFlyer: "unity-appsflyer",
};

const GO_STACK: Record<string, string> = {
  "google.golang.org/grpc": "go-grpc",
  "go.mongodb.org/mongo-driver": "go-mongodb",
  "github.com/aws/aws-sdk-go": "go-aws-sdk-v1",
  "github.com/aws/aws-sdk-go-v2": "go-aws-sdk-v2",
  "github.com/labstack/echo": "go-echo",
  "github.com/labstack/echo/v4": "go-echo",
  "github.com/gin-gonic/gin": "go-gin",
  "github.com/gofiber/fiber/v2": "go-fiber",
  "github.com/spf13/viper": "go-viper",
  "go.uber.org/zap": "go-zap",
  "github.com/sirupsen/logrus": "go-logrus",
  "github.com/redis/go-redis/v9": "go-redis",
  "github.com/go-redis/redis/v8": "go-redis",
  "github.com/jackc/pgx/v5": "go-pgx",
  "github.com/stretchr/testify": "go-testify",
  "github.com/onsi/ginkgo/v2": "go-ginkgo",
  "google.golang.org/protobuf": "go-protobuf",
  "github.com/golang/protobuf": "go-protobuf",
  "github.com/aws/aws-lambda-go": "go-aws-lambda",
  "firebase.google.com/go": "go-firebase-admin",
  "firebase.google.com/go/v4": "go-firebase-admin",
  "google.golang.org/api": "go-google-api",
  "github.com/spf13/cobra": "go-cobra",
  "github.com/golang-jwt/jwt": "go-jwt",
  "github.com/golang-jwt/jwt/v5": "go-jwt",
};

const PY_STACK: Record<string, string> = {
  requests: "py-requests",
  httpx: "py-httpx",
  fastapi: "py-fastapi",
  flask: "py-flask",
  django: "py-django",
  pydantic: "py-pydantic",
  sqlalchemy: "py-sqlalchemy",
  pandas: "py-pandas",
  numpy: "py-numpy",
  pytest: "py-pytest",
  ruff: "py-ruff",
  black: "py-black",
  mypy: "py-mypy",
  "discord.py": "py-discord",
  "py-cord": "py-discord",
  anthropic: "py-anthropic",
  openai: "py-openai",
  slack_sdk: "py-slack-sdk",
  "slack-sdk": "py-slack-sdk",
  slack_bolt: "py-slack-bolt",
  "slack-bolt": "py-slack-bolt",
  python_dotenv: "py-dotenv",
  "python-dotenv": "py-dotenv",
  dotenv: "py-dotenv",
  supabase: "py-supabase",
  praw: "py-praw",
  "google-play-scraper": "py-google-play-scraper",
  google_play_scraper: "py-google-play-scraper",
  gspread: "py-gspread",
  "firebase-admin": "py-firebase-admin",
  firebase_admin: "py-firebase-admin",
};

const INFRA_FILES: { match: (name: string) => boolean; id: string }[] = [
  { match: (n) => n === "Jenkinsfile" || /^Jenkinsfile\..+/.test(n), id: "jenkins-pipeline" },
  { match: (n) => n === "Dockerfile" || /\.[Dd]ockerfile$/.test(n) || n.startsWith("Dockerfile."), id: "docker" },
  { match: (n) => n === "docker-compose.yml" || n === "docker-compose.yaml" || /^docker-compose\..+\.ya?ml$/.test(n) || /^compose\.ya?ml$/.test(n), id: "docker-compose" },
  { match: (n) => /\.tf$/.test(n), id: "terraform" },
];

interface StackDetection {
  kind: StackKind;
  candidates: BootstrapCandidate[];
}

export async function bootstrap(repoRoot: string): Promise<BootstrapResult> {
  const detections: StackDetection[] = [];

  const ts = await detectTs(repoRoot);
  if (ts) detections.push(ts);
  const unity = await detectUnity(repoRoot);
  if (unity) detections.push(unity);
  const goRes = await detectGo(repoRoot);
  if (goRes) detections.push(goRes);
  const py = await detectPython(repoRoot);
  if (py) detections.push(py);
  const infra = await detectInfra(repoRoot);
  if (infra) detections.push(infra);

  const seen = new Set<string>();
  const candidates: BootstrapCandidate[] = [];
  for (const det of detections) {
    for (const cand of det.candidates) {
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      candidates.push(cand);
    }
  }

  const stacks = detections.map((d) => d.kind);
  if (stacks.length === 0) {
    log.warn(`no recognized stack at ${repoRoot}; bootstrap returns empty candidate list`);
  } else {
    log.debug(`detected stacks: ${stacks.join(", ")}`);
  }

  return {
    autoskillsVersion: PINNED_AUTOSKILLS_VERSION,
    stacks,
    candidates,
    source: "stub",
  };
}

async function detectTs(repoRoot: string): Promise<StackDetection | null> {
  const pkgPath = path.join(repoRoot, "package.json");
  if (!existsSync(pkgPath)) return null;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  } catch {
    return null;
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const candidates: BootstrapCandidate[] = [];
  for (const dep of Object.keys(deps)) {
    const ids = TS_STACK[dep];
    if (!ids) continue;
    for (const id of ids) {
      candidates.push({ id, reason: `dep:${dep}`, stack: "ts", importRoot: dep });
    }
  }
  return { kind: "ts", candidates };
}

async function detectUnity(repoRoot: string): Promise<StackDetection | null> {
  const manifestPath = path.join(repoRoot, "Packages", "manifest.json");
  const assetsDir = path.join(repoRoot, "Assets");
  const hasManifest = existsSync(manifestPath);
  const hasAssets = existsSync(assetsDir);
  if (!hasManifest && !hasAssets) return null;

  const candidates: BootstrapCandidate[] = [];
  const seenIds = new Set<string>();
  const push = (id: string, reason: string) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    candidates.push({ id, reason, stack: "unity", importRoot: null });
  };

  if (hasManifest) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { dependencies?: Record<string, string> };
      const deps = manifest.dependencies ?? {};
      for (const dep of Object.keys(deps)) {
        const id = UNITY_STACK[dep];
        if (id) push(id, `unity-pkg:${dep}`);
      }
    } catch {
      /* ignore malformed manifest */
    }
  }

  const pluginsDir = path.join(repoRoot, "Assets", "Plugins");
  if (existsSync(pluginsDir)) {
    try {
      const entries = await readdir(pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = UNITY_PLUGIN_DIR_HEURISTICS[entry.name];
        if (id) push(id, `unity-plugin-dir:Assets/Plugins/${entry.name}`);
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const entries = await readdir(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".csproj")) continue;
      for (const [needle, id] of Object.entries(UNITY_CSPROJ_HEURISTICS)) {
        if (entry.name.includes(needle)) push(id, `unity-csproj:${entry.name}`);
      }
    }
  } catch {
    /* ignore */
  }

  if (candidates.length === 0 && !hasManifest) return null;
  return { kind: "unity", candidates };
}

async function detectGo(repoRoot: string): Promise<StackDetection | null> {
  const goMods = await findGoMods(repoRoot, 3);
  if (goMods.length === 0) return null;
  const seenIds = new Set<string>();
  const candidates: BootstrapCandidate[] = [];
  for (const mod of goMods) {
    let body: string;
    try {
      body = await readFile(mod, "utf8");
    } catch {
      continue;
    }
    const requires = parseGoModRequires(body);
    for (const req of requires) {
      const id = matchGoStack(req);
      if (!id) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      candidates.push({
        id,
        reason: `go-mod:${path.relative(repoRoot, mod)}:${req}`,
        stack: "go",
        importRoot: null,
      });
    }
  }
  return { kind: "go", candidates };
}

async function findGoMods(root: string, maxDepth: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "vendor") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "go.mod") out.push(full);
      else if (entry.isDirectory()) await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return out;
}

function parseGoModRequires(body: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("require (")) { inBlock = true; continue; }
    if (inBlock && line === ")") { inBlock = false; continue; }
    let mod: string | undefined;
    if (inBlock) mod = line.split(/\s+/)[0];
    else if (line.startsWith("require ")) mod = line.replace(/^require\s+/, "").split(/\s+/)[0];
    if (mod) out.push(mod);
  }
  return out;
}

function matchGoStack(modulePath: string): string | null {
  if (GO_STACK[modulePath]) return GO_STACK[modulePath]!;
  for (const [prefix, id] of Object.entries(GO_STACK)) {
    if (modulePath === prefix) return id;
    if (modulePath.startsWith(prefix + "/")) return id;
  }
  return null;
}

async function detectPython(repoRoot: string): Promise<StackDetection | null> {
  const sources = await findPyManifests(repoRoot, 3);
  const pyFiles = await findPyFiles(repoRoot, 3);
  if (sources.length === 0 && pyFiles.length === 0) return null;

  const declared = new Set<string>();
  for (const src of sources) {
    try {
      const content = await readFile(src, "utf8");
      for (const m of content.matchAll(/^\s*([A-Za-z][A-Za-z0-9_.\-]*)\s*[=~<>!]/gm)) {
        const name = m[1]?.toLowerCase();
        if (name) declared.add(name);
      }
      for (const m of content.matchAll(/^\s*([A-Za-z][A-Za-z0-9_\-]*)\s*=\s*"\S+"/gm)) {
        const name = m[1]?.toLowerCase();
        if (name) declared.add(name);
      }
    } catch {
      continue;
    }
  }

  const importedTop = new Set<string>();
  for (const f of pyFiles) {
    try {
      const c = await readFile(f, "utf8");
      for (const m of c.matchAll(/^\s*(?:import\s+([A-Za-z_][A-Za-z0-9_]*)|from\s+([A-Za-z_][A-Za-z0-9_]*))/gm)) {
        const name = (m[1] ?? m[2])?.toLowerCase();
        if (name) importedTop.add(name);
      }
    } catch {
      continue;
    }
  }

  const candidates: BootstrapCandidate[] = [];
  const seen = new Set<string>();
  for (const dep of [...declared, ...importedTop]) {
    const id = PY_STACK[dep];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, reason: `py:${dep}`, stack: "python", importRoot: null });
  }
  return { kind: "python", candidates };
}

async function findPyManifests(root: string, maxDepth: number): Promise<string[]> {
  const out: string[] = [];
  const names = new Set(["Pipfile", "pyproject.toml", "requirements.txt", "requirements-dev.txt"]);
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "venv" || entry.name === ".venv" || entry.name === "vendor") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && names.has(entry.name)) out.push(full);
      else if (entry.isDirectory()) await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return out;
}

async function detectInfra(repoRoot: string): Promise<StackDetection | null> {
  const hits = new Map<string, string>();
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "vendor") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        for (const rule of INFRA_FILES) {
          if (rule.match(entry.name) && !hits.has(rule.id)) {
            hits.set(rule.id, path.relative(repoRoot, full));
          }
        }
      } else if (entry.isDirectory()) {
        await walk(full, depth + 1);
      }
    }
  }
  await walk(repoRoot, 0);
  if (hits.size === 0) return null;
  const candidates: BootstrapCandidate[] = [];
  for (const [id, where] of hits) {
    candidates.push({ id, reason: `infra:${where}`, stack: "infra", importRoot: null });
  }
  return { kind: "infra", candidates };
}

async function findPyFiles(root: string, maxDepth: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "venv" || entry.name === ".venv") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && full.endsWith(".py")) {
        try {
          if (statSync(full).size > 256 * 1024) continue;
        } catch {
          continue;
        }
        out.push(full);
      } else if (entry.isDirectory()) await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return out;
}
