# Cornerstone3D Codemods

Codemod registry packages for Cornerstone3D migrations. These are published to
the Codemod registry so users run them with `npx codemod`.

## Usage

Run the full Cornerstone3D v5 migration:

```sh
npx codemod @cornerstonejs/cornerstone3d-5
```

Run only the Generic Viewport migration:

```sh
npx codemod @cornerstonejs/cornerstone3d-5-generic-viewport
```

## Registry Packages

This workspace currently includes:

- `@cornerstonejs/cornerstone3d-5`: runs all available Cornerstone3D v5
  migration packages in the recommended order.
- `@cornerstonejs/cornerstone3d-5-generic-viewport`: migrates removed
  RenderingEngine viewport accessor APIs.

The Generic Viewport migration changes:

- `getStackViewports()` -> `getViewports().filter(utilities.viewportSupportsStackCompatibility)`
- `getVolumeViewports()` -> `getViewports().filter(utilities.viewportSupportsVolumeCompatibility)`
- `getStackViewport(id)` -> `getViewport(id)`

For simple variable declarations, `getStackViewport(id)` also adds a runtime
capability guard.

## Development

Validate all registry packages and run fixture tests:

```sh
cd packages/codemods
yarn validate
```

Validate only registry workflow metadata:

```sh
cd packages/codemods
yarn validate:registry
```

Run only the JSSG fixture tests:

```sh
cd packages/codemods
yarn test
```

Run a local registry package against a target checkout:

```sh
cd packages/codemods
npx codemod workflow run -w registry/cornerstone3d/5/generic-viewport -t /path/to/project --dry-run
```

## Registry Publishing

The package is intentionally private to npm. Publishing happens through the
Codemod registry packages under `packages/codemods/registry`.

Publish migration packages before aggregate packages that reference them.

To publish `cornerstone3d/5/generic-viewport`:

```sh
git tag cornerstone3d/5/generic-viewport@v0.1.0
git push origin cornerstone3d/5/generic-viewport@v0.1.0
```

To publish `cornerstone3d/5`:

```sh
git tag cornerstone3d/5@v0.1.0
git push origin cornerstone3d/5@v0.1.0
```

`Publish Codemod Registry Entry` resolves those tags to directories under
`packages/codemods/registry/` and publishes them with
`codemod/publish-action@v1`. `Validate Codemod Registry Entries` checks pull
requests and pushes to `main`.
