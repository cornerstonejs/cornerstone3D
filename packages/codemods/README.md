# Cornerstone3D Codemods

Codemod registry packages for Cornerstone3D migrations. These are published to
the Codemod registry so users run them with `npx codemod`.

## Usage

Run the full Cornerstone3D v5 migration:

```sh
npx codemod cornerstone3d/5 -t .
```

Run only the Viewport Next migration:

```sh
npx codemod cornerstone3d/5/viewport-next -t .
```

## Registry Packages

This workspace currently includes:

- `cornerstone3d/5`: runs all available Cornerstone3D v5 migration packages in
  the recommended order.
- `cornerstone3d/5/viewport-next`: migrates removed RenderingEngine viewport
  accessor APIs.

The Viewport Next migration changes:

- `getStackViewports()` -> `getViewports().filter(utilities.viewportSupportsStackCompatibility)`
- `getVolumeViewports()` -> `getViewports().filter(utilities.viewportSupportsVolumeCompatibility)`
- `getStackViewport(id)` -> `getViewport(id)`

For simple variable declarations, `getStackViewport(id)` also adds a runtime
capability guard.

## Development

Validate all registry packages:

```sh
cd packages/codemods
yarn validate:registry
```

Run the JSSG fixture tests:

```sh
cd packages/codemods
yarn test
```

Run a local registry package against a target checkout:

```sh
npx codemod workflow run -w packages/codemods/registry/cornerstone3d/5/viewport-next -t /path/to/project
```

## Registry Publishing

The package is intentionally private to npm. Publishing happens through the
Codemod registry packages under `packages/codemods/registry`.

To publish `cornerstone3d/5`:

```sh
git tag cornerstone3d/5@v0.1.0
git push origin cornerstone3d/5@v0.1.0
```

To publish `cornerstone3d/5/viewport-next`:

```sh
git tag cornerstone3d/5/viewport-next@v0.1.0
git push origin cornerstone3d/5/viewport-next@v0.1.0
```

`Publish Codemod Registry Entry` resolves those tags to directories under
`packages/codemods/registry/` and publishes them with
`codemod/publish-action@v1`. `Validate Codemod Registry Entries` checks pull
requests and pushes to `main`.
