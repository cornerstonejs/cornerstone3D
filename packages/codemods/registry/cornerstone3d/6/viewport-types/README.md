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
  same for `!==` and for the strings `'stack'` and `'orthographic'`. Only on
  a viewport that the file shows to come from Cornerstone, and only after an
  awaited mount of it (`await viewport.setStack(...)` and its kin) earlier
  in the same function: before its first mount a viewport is in the mode
  `empty`, where its 5.x type was already set. `viewport?.type` keeps its
  `?.`.
- `PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `WHOLE_SLIDE_NEXT` and
  `ECG_NEXT` become `PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG`,
  also as keys of `const { PLANAR_NEXT } = Enums.ViewportType`, which keep
  their local names (`{ PLANAR: PLANAR_NEXT }`).
- The strings `'stack'`, `'orthographic'` and `'*Next'` become their 6.0
  strings in a viewport input that the file passes to `enableElement` or
  `setViewports` of a Cornerstone rendering engine (directly, in an array,
  pushed onto one, or through a variable), and in a comparison as above.

## Reported

- Review: each `AXIAL` written for an `ORTHOGRAPHIC` viewport, and an
  `ORTHOGRAPHIC` whose orientation the codemod cannot see (a conditional
  type, a variable).
- Manual: `PERSPECTIVE` and `'perspective'` (a 3D viewport draws the volume
  in 3D, a decision of the guide); `STACK` or `ORTHOGRAPHIC` in another place,
  such as a `switch` or a comparison with `viewportInput.type`; a comparison
  before a mount (`the viewport may not show its data yet`) or on a viewport
  known by its name only; `STACK`, `ORTHOGRAPHIC` and `PERSPECTIVE` taken
  out of `Enums.ViewportType` by a pattern; an object with the keys of a
  viewport input that the file does not pass to the engine
  (`not shown to be a viewport input`); a stored
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
