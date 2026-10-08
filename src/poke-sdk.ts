// The `poke` package's ESM entry (dist/index.mjs) executes
// `createRequire(import.meta.url)` at module scope, which throws in the
// Workers runtime (Cloudflare error 10021: import.meta.url is undefined).
// Its exports map only exposes "." and blocks a bare "poke/dist/index.cjs"
// specifier, so we import the CommonJS bundle by relative path — esbuild
// bundles it cleanly under nodejs_compat.
import "./node-shims";
// @ts-ignore — the .cjs file ships no adjacent type declarations
import pokeCjs from "../node_modules/poke/dist/index.cjs";
import type { Poke as PokeClass } from "poke";

export const Poke: typeof PokeClass = (pokeCjs as { Poke: typeof PokeClass }).Poke;
