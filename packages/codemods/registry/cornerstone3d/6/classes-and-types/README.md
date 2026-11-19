# Cornerstone3D 6.0 Classes and Types Migration

Rewrites the viewport classes and TypeScript types that Cornerstone3D 6.0
removes or renames. Step 2 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-2-class-checks-and-typescript-types).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-classes-and-types
```

## Changes

- `Types.IStackViewport`, `Types.IVolumeViewport` and
  `Types.IBaseVolumeViewport` become `PlanarViewport`;
  `Types.IVideoViewport`, `Types.IWSIViewport` and `Types.IECGViewport`
  become `VideoViewport`, `WSIViewport` and `ECGViewport`. The class comes in
  as a type import of `@cornerstonejs/core`.
- `Types.IVolumeViewport`, `Types.IBaseVolumeViewport` and
  `BaseVolumeViewport` become `VolumeViewport3D` where the file shows a 3D
  viewport: the viewport input with the id of the `getViewport` call has the
  type `VOLUME_3D`, or an enclosing `if` or `case` tests `VOLUME_3D`.
  Applications cast 3D viewports to `IVolumeViewport` in 5.x.
- A cast of `getViewport` on a typed rendering engine becomes its type
  argument: `renderingEngine.getViewport(id) as Types.IStackViewport` becomes
  `renderingEngine.getViewport<PlanarViewport>(id)`. On an untyped engine the
  cast stays, with the class.
- `Types.IGenericViewport` becomes `Types.IViewport`.
- The legacy classes `StackViewport`, `VolumeViewport` and
  `BaseVolumeViewport` become `PlanarViewport` in a type, and `Viewport`
  becomes `GenericViewport`.
- `x instanceof StackViewport` becomes `utilities.viewportIsInStackMode(x)`,
  `VolumeViewport` `utilities.getViewportContentMode(x) === 'volume'`,
  `BaseVolumeViewport` `utilities.viewportIsInVolumeMode(x)`.
- `GenericVolumeViewport3D`, `VideoGenericViewport`, `WSIGenericViewport`,
  `ECGGenericViewport` and the legacy `LegacyVolumeViewport3D` become
  `VolumeViewport3D`, `VideoViewport`, `WSIViewport` and `ECGViewport`, in
  the import and in every use.

## Reported

- Review: each `instanceof` rewrite. An empty viewport is in no mode, where
  a legacy instance check was true before the data.
- Manual: a legacy class used as a value (`new StackViewport(...)`), the
  removed `Types.*ViewportProperties`, `Types.IVolumeInput`,
  `Types.VolumeInputCallback`, `Types.SetAspectRatioOptions` and
  `Types.ImageSetOptions`, and `utilities.isGenericViewport(...)`
  (deprecated: drop the check and keep its true branch).

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/classes-and-types
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript,
so `<Type>value` casts parse), the others in `tests/tsx`. Each
`metrics.json` holds the sites that a fixture reports.
