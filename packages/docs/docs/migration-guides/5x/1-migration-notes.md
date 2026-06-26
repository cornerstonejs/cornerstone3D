# 5.x Migration Reference Notes

This page tracks smaller migration-impacting behavior changes that are useful
as reference during 4.x -> 5.x upgrades.

## `disableScale` and `imageFrame.preScale`

## What Changed

In 5.x, when `disableScale` is `true`, Cornerstone3D no longer sets
`imageFrame.preScale` and preserves the original pixel min/max range
(`minAfterScale = minBeforeScale`, `maxAfterScale = maxBeforeScale`).

This is intentional for cases where scaling is identity
(for example slope/intercept being 1/0).

## Why This Matters

In 4.x, some workflows implicitly relied on `imageFrame.preScale` always being
present. In 5.x, that object may be `undefined` when scaling is disabled.

## Migration Guidance

- Treat `imageFrame.preScale` as optional and guard access accordingly.
- If your downstream logic requires a pre-scale descriptor, create one in your
  application code when `disableScale` is enabled.
- If you only need pixel statistics, use `minPixelValue`/`maxPixelValue` from
  the image frame values directly instead of assuming post-scale values.

## `instance` data object model in metadata modules

### What Changed

In 5.x, this is primarily a documentation clarification rather than a new
runtime behavior change: `instance` data should be understood as a single
per-frame object that includes computed per-frame values merged into one object.

This object can use inheritance to compose values from multiple metadata levels.
Because of that, consumers should not assume all attributes are directly
iterable/enumerable on the object itself.

### 4.x vs 5.x interpretation

- **4.x:** this shape/behavior existed in practice, but was not clearly documented.
- **5.x:** the same model is now explicitly documented so integrations can rely
  on the intended contract.

### Migration Guidance

- Do not rely on object enumeration (`Object.keys`, `for...in`) to discover all
  available attributes on instance data.
- Access known attributes explicitly, or use module utilities that understand the
  composed/inherited object structure.
- When building instance data from naturalized metadata, prefer the
  `combineFramesInstance` utility so downstream modules receive the expected
  base object shape.

## ESM packaging and TypeScript `moduleResolution`

### What Changed

The published `@cornerstonejs/*` packages now declare themselves as ESM
(`"type": "module"`) and emit relative imports with explicit `.js` extensions in
both the runtime `.js` files and the `.d.ts` declarations. This makes the
packages resolve correctly under **native Node ESM** (server-side rendering,
Node test runners, packaging linters, and Node 25+ which hard-fails on missing
extensions), not just inside bundlers.

### Why This Matters

- **Bundler consumers are unaffected.** webpack, Vite, Next, and similar tools
  resolve `./foo` and `./foo.js` identically, so applications such as OHIF
  require no changes.
- **Native Node now works.** Importing a package on a Node code path no longer
  fails with `ERR_MODULE_NOT_FOUND` due to extensionless specifiers.

### Migration Guidance

Use a modern TypeScript module resolution mode — `"bundler"`, `"node16"`, or
`"nodenext"` — which is the default for current toolchains and understands the
`.js`-extensioned imports inside the shipped `.d.ts` files.

The legacy `moduleResolution: "node"` (a.k.a. `node10`) does **not** map a
`.js` specifier in a declaration back to its `.d.ts`, and it ignores the package
`exports` map entirely. On that setting some deep re-exported types may resolve
as `any` or fail to resolve. This is a **type-resolution** concern only —
runtime behavior is unaffected — but if you see missing types, switch to
`"bundler"`/`"node16"`/`"nodenext"`.
