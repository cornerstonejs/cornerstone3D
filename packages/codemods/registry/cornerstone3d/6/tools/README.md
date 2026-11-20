# Cornerstone3D 6.0 Tools Migration

Moves the modules of `@cornerstonejs/tools` that 6.0 renames, and reports the
names of the tools that 6.0 removes. Step 11 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-11-tools-and-synchronizers).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-tools
```

## Changes

- `@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/legacyVolumePlan`
  becomes `.../labelmapRenderPlan/volumeLabelmapPlan`, and
  `createLegacyVolumeLabelmapPlan` `createVolumeLabelmapPlan`, with its uses.
  When the file uses the new name already, or uses the old one in a
  shorthand property or an export, the import keeps the old local name:
  `createVolumeLabelmapPlan as createLegacyVolumeLabelmapPlan`.
- `@cornerstonejs/tools/segmentation/labelmapModel/labelmapLegacyAdapter`
  becomes `.../labelmapModel/labelmapPrimaryLayerFields`, with the same two
  functions.
- A re-export (`export { ... } from`) of these modules moves the same way; a
  renamed name keeps its public name
  (`export { createVolumeLabelmapPlan as createLegacyVolumeLabelmapPlan }`).
- A plain named import or re-export of `viewportSupportsImageSlices` and
  `viewportSupportsStackCalibration` from the deleted
  `@cornerstonejs/tools/utilities/viewportCapabilities` comes from
  `@cornerstonejs/core/utilities`, which exports both by the same names
  (`utilities.viewportSupportsImageSlices` of the core).

## Reported

All manual: an import or a re-export of one of these modules with another
name, and an `export *` of one; the module
`tools/displayTools/Labelmap/addVolumesAsIndependentComponents`;
`removeVolumeLabelmapImageMapperActors`; `getSlabThicknessOrDefault`;
`viewportSupportsStackCompatibility` and `StackCompatibilityViewport` of the
tools; any other import or re-export of
`@cornerstonejs/tools/utilities/viewportCapabilities` (a type of it, a default
or namespace import, `export *`, the checks with another name, an import for
its side effects, `import {} from` and `export {} from`: the module no
longer resolves); a dynamic `import()` or a `require()` of a module that
6.0 moves or deletes whole;
`utilities.spatial.rotateViewportAroundWorldPoint`.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/tools
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
