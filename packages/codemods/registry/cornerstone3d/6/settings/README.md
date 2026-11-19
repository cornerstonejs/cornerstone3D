# Cornerstone3D 6.0 Settings Migration

Rewrites the settings that Cornerstone3D 6.0 removes. Step 12 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-12-the-version-and-the-settings).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-settings
```

## Changes

- `rendering.useGenericViewport` is removed from a configuration object; an
  empty `rendering` goes too, and `init({ rendering: { useGenericViewport: true } })`
  becomes `init()`.
- `rendering.useCPURendering: true` becomes
  `planar: { renderBackend: 'cpu' }`, `false` is removed, another value `x`
  becomes `planar: { renderBackend: x ? 'cpu' : 'auto' }`.
- `rendering.planar.cpuVolume.useViewportSamplingForLinear` is removed.
- `setUseCPURendering(true)` becomes `setRenderBackend('cpu')`, `false`
  `setRenderBackend('auto')`, another value `x`
  `setRenderBackend(x ? 'cpu' : 'auto')`.
- `resetUseCPURendering()` becomes `setRenderBackend('auto')`.
- `getShouldUseCPURendering()` becomes `getEffectiveRenderBackend() === 'cpu'`.

The imports of `@cornerstonejs/core` follow: the old names go when no use is
left, the new ones come in.

## Reported

- Review: each `setUseCPURendering` call (it also marked the library
  initialized; call `init()` first) and each `useCPURendering` key (a 3D
  viewport stays on the GPU).
- Manual: `getUseGenericViewport()`, `setUseCPURendering` with two arguments
  or used as a value, and `useCPURendering` next to a `planar` key.
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
