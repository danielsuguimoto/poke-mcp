// workerd does not define __filename/__dirname. The poke CJS bundle
// references __filename at module scope (path resolution used by the
// xdg-open browser helper for `poke login` — a code path a Worker never
// reaches). Provide inert globals so module evaluation succeeds.
// Must be imported BEFORE the poke bundle.
const g = globalThis as Record<string, unknown>;
g.__filename ??= "/worker/index.js";
g.__dirname ??= "/worker";
export {};
