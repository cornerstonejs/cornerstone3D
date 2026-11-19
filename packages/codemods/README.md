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

Run the full Cornerstone3D 6.0 migration, from the latest 5.x:

```sh
npx codemod @cornerstonejs/cornerstone3d-6
```

It prints the sites that it leaves to you as the metrics
`cornerstone3d-6-manual` and `cornerstone3d-6-review`. See
[registry/cornerstone3d/6/README.md](registry/cornerstone3d/6/README.md).

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

- `@cornerstonejs/cornerstone3d-6`: runs the seven Cornerstone3D 6.0
  migration packages in the recommended order: `-settings`,
  `-viewport-types`, `-classes-and-types`, `-events`, `-display-sets`,
  `-viewport-members` and `-tools` (each under
  `@cornerstonejs/cornerstone3d-6-`). Each package keeps a copy of
  `scripts/lib.ts`, because each is published on its own;
  `yarn validate:registry` checks that the copies are equal.

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

`yarn test` runs the fixtures of every registry package. A 6.0 package keeps
the fixtures of `.ts` files in `tests/typescript`, parsed as TypeScript, and
the others in `tests/tsx`; each `metrics.json` holds the sites that a fixture
reports.

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
