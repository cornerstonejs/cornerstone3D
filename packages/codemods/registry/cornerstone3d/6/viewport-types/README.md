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
  awaited mount of the same binding (`await viewport.setStack(...)` and its
  kin) that runs before it in the same function: the viewport is a `const`
  or a parameter that the file never writes, so a shadowing `viewport` or a
  reassigned one proves nothing. Before its first mount a viewport is in the
  mode `empty`, where its 5.x type was already set. `viewport?.type` keeps
  its `?.`.
- `PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `WHOLE_SLIDE_NEXT` and
  `ECG_NEXT` become `PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG`,
  also as keys of `const { PLANAR_NEXT } = Enums.ViewportType`, which keep
  their local names (`{ PLANAR: PLANAR_NEXT }`), a quoted key its quotes and
  a key with a default its default.
- The strings `'stack'`, `'orthographic'` and `'*Next'` become their 6.0
  strings in a viewport input that the file passes to `enableElement` or
  `setViewports` of a Cornerstone rendering engine (directly, in an array,
  pushed onto one, or through a variable), and in a comparison as above.

## Reported

- Review: each `AXIAL` written for an `ORTHOGRAPHIC` viewport, and an
  `ORTHOGRAPHIC` whose orientation the codemod cannot see (a conditional
  type, a variable).
- Review: a function (a declaration, an arrow, a method) in which the
  rewrite turns a return of `STACK` and a return of `ORTHOGRAPHIC` into
  `PLANAR`
  (`ViewportType.PLANAR: one function returned STACK and ORTHOGRAPHIC, read what its callers do with the answer`,
  at the line of the function). The rewrite is right for a viewport type.
  An application that stored or compared the answer to tell a stack from a
  volume has lost it: give it its own values, and ask
  `viewport.getCurrentMode()` for a live viewport. A return counts directly
  (also in each `case` of a `switch`), in a branch of a conditional, and
  through a name: a `const` with its value, a `let` or a `var` with every
  value when the file writes it only as `name = value`. A name written in
  another way, a parameter and a call show nothing, so there is no entry. A
  `STACK` that the codemod does not rewrite (in `type = ViewportType.STACK`,
  or in a conditional) is in the manual report, and the function has no
  entry. A function that returned a plain and a `_NEXT` name of one type
  (`VOLUME_3D` and `VOLUME_3D_NEXT`) has no entry: 6.0 has one viewport of
  that type.
- Review: two operands that the rewrite makes the same expression
  (`ViewportType.VOLUME_3D: two operands of one || are the same now, read what each tested in 5.x`,
  at the line of the second one): in a chain of `||` or of `&&`, as `case`
  labels of one `switch`, or as entries of an array literal used with
  `includes`, directly or through a `const`.
  `type === ViewportType.VOLUME_3D || type === ViewportType.VOLUME_3D_NEXT`
  told a legacy viewport from a next one in 5.x and is one test after the
  rename. Where the code meant "any 3D viewport", delete one operand; where
  it meant "a legacy 3D viewport", the test is true for every 3D viewport in
  6.0, so delete that branch. Of two equal `case` labels only the first
  runs. Operands are compared without comments, casts and white space. Two
  operands that were the same before, and a member with its own string
  (`viewport.type === ViewportType.STACK || viewport.type === 'stack'`),
  have no entry.
- Manual: `PERSPECTIVE` and `'perspective'` (a 3D viewport draws the volume
  in 3D, a decision of the guide); `STACK` or `ORTHOGRAPHIC` in another place,
  such as a `switch` or a comparison with `viewportInput.type`; a comparison
  before a mount (`the viewport may not show its data yet`) or on a viewport
  known by its name only (a `let` among them); `STACK`, `ORTHOGRAPHIC` and
  `PERSPECTIVE` taken out of `Enums.ViewportType` by a pattern, and a rest
  element or a computed key of such a pattern; a removed or deprecated
  member in brackets (`Enums.ViewportType['STACK']`); an object with the keys of a
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
