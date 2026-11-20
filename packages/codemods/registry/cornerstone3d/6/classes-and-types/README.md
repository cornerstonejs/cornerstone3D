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
  viewport: every viewport input with the id of the `getViewport` call (the
  same string, or the same `const`) has the type `VOLUME_3D`, as a member
  of the core `Enums.ViewportType` or the string `'volume3d'`, or the node
  runs only when the type of that viewport equals `VOLUME_3D` (an enclosing
  `if`, `else` or `case` of the same function that compares
  `<viewport>.type`, or a `const` that holds it such as
  `const { type } = viewport`, where `<viewport>` is the binding that the
  cast casts; without a negation or `||`, and a `case` that no case falls
  into). Applications cast 3D viewports to `IVolumeViewport` in 5.x. Where a
  test of `VOLUME_3D` encloses the node and decides nothing (a test of
  another value such as a parameter `type` or a `cardType`, of a shadowing
  name, or outside the function of the node), the type stays and is
  reported.
- A cast of `getViewport` on a typed rendering engine becomes its type
  argument: `renderingEngine.getViewport(id) as Types.IStackViewport` becomes
  `renderingEngine.getViewport<PlanarViewport>(id)`. On an untyped engine the
  cast stays, with the class.
- `Types.IGenericViewport` becomes `Types.IViewport`.
- The legacy classes `StackViewport`, `VolumeViewport` and
  `BaseVolumeViewport` become `PlanarViewport` in a type, and `Viewport`
  becomes `GenericViewport`.
- `x instanceof StackViewport` becomes `utilities.viewportIsInStackMode(x)`,
  `VolumeViewport` `(utilities.getViewportContentMode(x) === 'volume')` (in
  parentheses where the comparison would bind otherwise),
  `BaseVolumeViewport` `utilities.viewportIsInVolumeMode(x)`. Only after an
  awaited mount of the same binding of `x` (`await x.setStack(...)` and its
  kin) that runs before it in the same function, where `x` is a `const` or a
  parameter that the file never writes: before its first mount a viewport is
  in the mode `empty`, where a 5.x instance check was already true.
- `GenericVolumeViewport3D`, `VideoGenericViewport`, `WSIGenericViewport`,
  `ECGGenericViewport` and the legacy `LegacyVolumeViewport3D` become
  `VolumeViewport3D`, `VideoViewport`, `WSIViewport` and `ECGViewport`, in
  the import and in every use. A shorthand property and an export keep their
  public name (`{ GenericVolumeViewport3D: VolumeViewport3D }`,
  `export { VolumeViewport3D as GenericVolumeViewport3D }`), and so does a
  re-export of the core.

## Reported

- Review: each `instanceof` rewrite.
- Manual: an `instanceof` before a mount
  (`the viewport may not show its data yet`), a legacy class used as a value
  (`new StackViewport(...)`, a shorthand property, an export or a re-export
  of the core; its import stays), a class in brackets on the core namespace
  (`cs['StackViewport']`), an `IVolumeViewport` under a test of
  `VOLUME_3D` that does not show the family, an `IVolumeViewport` whose
  viewport inputs give `VOLUME_3D` and another type, or a type that only
  the running code resolves (`type: flag ? VOLUME_3D : PLANAR`, a name, a
  call), the
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
