import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probe, isUsed } from "../src/probe.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE = path.resolve(__dirname, "fixtures", "sample-repo");

test("probe detects react and zod imports", async () => {
  const result = await probe(SAMPLE);
  assert.ok(isUsed(result, "react"), "react should be used");
  assert.ok(isUsed(result, "zod"), "zod should be used");
});

test("probe reports tailwind as unused (declared but not imported)", async () => {
  const result = await probe(SAMPLE);
  assert.equal(isUsed(result, "tailwindcss"), false);
});

test("probe counts files and sites", async () => {
  const result = await probe(SAMPLE);
  const react = result.usage.get("react");
  assert.ok(react);
  assert.equal(react.files, 1);
  assert.ok(react.sites >= 1);
});

test("probe ignores node_modules", async () => {
  const result = await probe(SAMPLE);
  for (const key of result.usage.keys()) {
    assert.ok(!key.includes("node_modules"), `unexpected key: ${key}`);
  }
});
