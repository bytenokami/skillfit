const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

const envLevel = (process.env.SKILLFIT_LOG ?? "info") as Level;
const current = LEVELS[envLevel] ?? LEVELS.info;

function emit(level: Level, prefix: string, args: unknown[]): void {
  if (LEVELS[level] > current) return;
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${prefix} ${args.map(String).join(" ")}\n`);
}

export const log = {
  info: (...a: unknown[]) => emit("info", "›", a),
  ok: (...a: unknown[]) => emit("info", "✓", a),
  warn: (...a: unknown[]) => emit("warn", "!", a),
  error: (...a: unknown[]) => emit("error", "✗", a),
  debug: (...a: unknown[]) => emit("debug", "·", a),
};
