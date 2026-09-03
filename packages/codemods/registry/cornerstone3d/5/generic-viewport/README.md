# Cornerstone3D v5 Generic Viewport Migration

Replaces removed RenderingEngine viewport accessor APIs with Cornerstone3D v5
compatible viewport APIs.

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-5-generic-viewport
```

To preview changes before writing files:

```sh
npx codemod @cornerstonejs/cornerstone3d-5-generic-viewport --dry-run
```

## Changes

- `getStackViewports()` becomes
  `getViewports().filter(utilities.viewportSupportsStackCompatibility)`.
- `getVolumeViewports()` becomes
  `getViewports().filter(utilities.viewportSupportsVolumeCompatibility)`.
- `getStackViewport(id)` becomes `getViewport(id)`.
- Simple `const viewport = renderingEngine.getStackViewport(id)` declarations
  receive a runtime `viewportSupportsStackCompatibility` guard before stack
  APIs are used.

When a file needs compatibility guards, the transform adds `utilities` to an
existing `@cornerstonejs/core` named import or inserts a new named import.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/5/generic-viewport
```
