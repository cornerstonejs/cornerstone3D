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
- `@cornerstonejs/tools/segmentation/labelmapModel/labelmapLegacyAdapter`
  becomes `.../labelmapModel/labelmapPrimaryLayerFields`, with the same two
  functions.

## Reported

All manual: an import of one of these modules with another name; the module
`tools/displayTools/Labelmap/addVolumesAsIndependentComponents`;
`removeVolumeLabelmapImageMapperActors`; `getSlabThicknessOrDefault`;
`viewportSupportsStackCompatibility` and `StackCompatibilityViewport` of the
tools; `utilities.spatial.rotateViewportAroundWorldPoint`.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/tools
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
