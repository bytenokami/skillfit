import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesize } from "../src/synthesize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE = path.resolve(__dirname, "fixtures", "sample-repo");

test("synthesize produces deterministic output for same inputs", async () => {
  const a = await synthesize(SAMPLE);
  const b = await synthesize(SAMPLE);
  assert.equal(a.hash, b.hash);
  assert.equal(a.body, b.body);
});

test("synthesize includes source path in body", async () => {
  const result = await synthesize(SAMPLE);
  assert.ok(result.body.includes("CLAUDE.md"), "body should mention CLAUDE.md");
});

test("synthesize hash format", async () => {
  const result = await synthesize(SAMPLE);
  assert.match(result.hash, /^sha256:[a-f0-9]{64}$/);
});

test("synthesize includes template version in inputs", async () => {
  const result = await synthesize(SAMPLE);
  assert.ok(result.inputs.some((i) => i.startsWith("template@")));
});
