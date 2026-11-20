# Cornerstone3D 6.0 Settings Migration

Rewrites the settings that Cornerstone3D 6.0 removes. Step 12 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-12-the-version-and-the-settings).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-settings
```

## Changes

The configuration keys change only in an object that the file passes to the
core `init` or `setConfiguration`, directly or through a variable. The
functions are found by their import, also under an alias, or through the
core namespace.

- `rendering.useGenericViewport` is removed from a configuration object; an
  empty `rendering` goes too, and `init({ rendering: { useGenericViewport: true } })`
  becomes `init()`. Neighbouring keys that go are removed in one edit.
- `rendering.useCPURendering: true` becomes
  `planar: { renderBackend: 'cpu' }`, `false` is removed, another value `x`
  becomes `planar: { renderBackend: x ? 'cpu' : 'auto' }`.
- `rendering.planar.cpuVolume.useViewportSamplingForLinear` is removed.
- A shorthand key, such as `rendering: { useCPURendering }`, is a key whose
  value is the name it reads: `useCPURendering` becomes
  `planar: { renderBackend: useCPURendering ? 'cpu' : 'auto' }`, and the
  other two are removed.
- `setUseCPURendering(true)` becomes `setRenderBackend('cpu')`, `false`
  `setRenderBackend('auto')`, another value `x`
  `setRenderBackend(x ? 'cpu' : 'auto')`.
- `resetUseCPURendering()` becomes `setRenderBackend('auto')`.
- `getShouldUseCPURendering()` becomes `getEffectiveRenderBackend() === 'cpu'`.

The imports of `@cornerstonejs/core` follow: an old name goes when every
reference to it changed, the new ones come in, under a fresh alias such as
`coreSetRenderBackend` when a name of the file takes or hides theirs.

## Reported

- Review: each `setUseCPURendering` call (it also marked the library
  initialized; call `init()` first) and each `useCPURendering` key (a 3D
  viewport stays on the GPU).
- Manual: `getUseGenericViewport()`, `setUseCPURendering` with two arguments
  or a spread argument (`setUseCPURendering(...tuple)`), a setting function
  used as a value (a shorthand property, an export; its import stays), in
  brackets on the namespace or in an `export { ... } from` of the core, and
  `useCPURendering` next to a `planar` key.
- Manual: a key of an object that the file does not pass to `init`, a
  removed key whose value runs code, such as `useGenericViewport: read()`,
  and a key whose value calls a setting function, such as
  `useCPURendering: getShouldUseCPURendering()` (the call is rewritten, the
  key stays for the reader).
- `viewport.setUseCPURendering()`, the member of a stack viewport, is
  reported by `@cornerstonejs/cornerstone3d-6-viewport-members`.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/settings
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
