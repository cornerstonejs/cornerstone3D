# @cornerstonejs/codemods

Codemods for Cornerstone3D migrations. These transforms are implemented with
[jscodeshift](https://github.com/facebook/jscodeshift), so they can run through
the package CLI or directly through the jscodeshift CLI.

## Usage

List available transforms:

```sh
npx @cornerstonejs/codemods --list
```

Run a transform:

```sh
npx @cornerstonejs/codemods rendering-engine-viewport-accessors src
```

Preview changes without writing files:

```sh
npx @cornerstonejs/codemods rendering-engine-viewport-accessors src --dry-run
```

Run the transform through jscodeshift directly:

```sh
npx jscodeshift \
  -t node_modules/@cornerstonejs/codemods/src/transforms/rendering-engine-viewport-accessors.js \
  src \
  --extensions=js,jsx,ts,tsx \
  --parser=tsx
```

## Transforms

This package currently includes 1 transform.

### `rendering-engine-viewport-accessors`

Migrates removed rendering-engine viewport accessors:

- `getStackViewports()` -> `getViewports().filter(utilities.viewportSupportsStackCompatibility)`
- `getVolumeViewports()` -> `getViewports().filter(utilities.viewportSupportsVolumeCompatibility)`
- `getStackViewport(id)` -> `getViewport(id)`

For simple variable declarations, `getStackViewport(id)` also adds a runtime
capability guard.

## Development

Run tests:

```sh
yarn workspace @cornerstonejs/codemods test
```
