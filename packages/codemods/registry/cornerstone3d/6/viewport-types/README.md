# Cornerstone3D 6.0 Viewport Types Migration

Rewrites the viewport types that Cornerstone3D 6.0 removes or renames. Step 1
of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-1-the-viewport-types).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-viewport-types
```

## Changes

A `ViewportType` is found through the core `Enums`: `Enums.ViewportType.X`,
an alias of `Enums`, the namespace import, or `const { ViewportType } = Enums`.

- `ViewportType.STACK` and `ORTHOGRAPHIC` in the `type` of a viewport input,
  in a variable, a return value or an assignment to `.type` become `PLANAR`.
- An `ORTHOGRAPHIC` viewport input without an orientation gets the 5.x
  default written out: `defaultOptions: { orientation: Enums.OrientationAxis.AXIAL }`,
  or `orientation` added first to its `defaultOptions`.
- `viewport.type === ViewportType.STACK` becomes
  `viewport.getCurrentMode() === 'stack'`, `ORTHOGRAPHIC` `'volume'`; the
  same for `!==` and for the strings `'stack'` and `'orthographic'`.
- `PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `WHOLE_SLIDE_NEXT` and
  `ECG_NEXT` become `PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG`.
- In a viewport input (an object with `viewportId` or `element`) and in a
  comparison with `viewport.type`, the strings `'stack'`, `'orthographic'` and
  `'*Next'` become their 6.0 strings.

## Reported

- Review: each `AXIAL` written for an `ORTHOGRAPHIC` viewport, and an
  `ORTHOGRAPHIC` whose orientation the codemod cannot see (a conditional
  type, a variable).
- Manual: `PERSPECTIVE` and `'perspective'` (a 3D viewport draws the volume
  in 3D, a decision of the guide); `STACK` or `ORTHOGRAPHIC` in another place,
  such as a `switch` or a comparison with `viewportInput.type`; a stored
  `'*Next'` string; `defaultOptions.displayArea` and
  `defaultOptions.aspectRatio` of a viewport input, which a planar viewport
  does not apply by itself.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/viewport-types
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
