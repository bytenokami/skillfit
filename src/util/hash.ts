import { createHash } from "node:crypto";

export function sha256(data: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

export function shortHash(full: string): string {
  return full.replace(/^sha256:/, "").slice(0, 12);
}
