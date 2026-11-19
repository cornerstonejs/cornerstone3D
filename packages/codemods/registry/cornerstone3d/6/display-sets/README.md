# Cornerstone3D 6.0 Display Sets Migration

Rewrites the data calls of the legacy viewports to display sets. Step 3 of
the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-3-the-data).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-display-sets
```

## Changes

Only on a viewport: a name such as `viewport` or `ctViewport`, a call of
`getViewport`, or a variable typed as or holding one.

- `viewport.setStack(imageIds, index)` as a statement, on a viewport that is
  a name or a member chain, becomes:

  ```ts
  utilities.genericViewportDisplaySetMetadataProvider.add(
    `${viewport.id}:stack`,
    {
      kind: 'planar',
      imageIds,
      initialImageIdIndex: index,
    }
  );
  await viewport.setDisplaySets({ displaySetId: `${viewport.id}:stack` });
  ```

  The index is 0 when the call had none, as in 5.x. Each viewport registers
  its own stack, as `setStack` kept one stack for each viewport.

- `viewport.setVolumes([{ volumeId }])` and
  `setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds)` as
  statements become a registration under the volume id and
  `setDisplaySets({ displaySetId: volumeId })` on each viewport, when the
  file creates that volume with
  `volumeLoader.createAndCacheVolume(volumeId, { imageIds })` before the call,
  in a scope that the call sees.
- `setVideo(imageId, frameNumber)` becomes
  `setDisplaySets({ displaySetId: imageId, options: { frameNumber } })`, and
  `setEcg(imageId)` `setDisplaySets({ displaySetId: imageId })`.
- The new mount waits (`await`) when the old call waited or when its function
  is `async`, so code after it sees the view.

## Reported

- Review: a mount in a function that is not `async` (a next viewport has no
  view before its mount).
- Manual, with the reason: a `setStack` that is not a statement or whose
  viewport is a call; a `setVolumes` input with `callback`, `blendMode`,
  `slabThickness`, `visibility` or `actorUID`, with more volumes, or whose
  image ids are not known; `addVolumes`, `addVolumesToViewports`,
  `convertStackToVolumeViewport`, `convertVolumeToStackViewport`,
  `removeVolumeActors`, `setWSI`, `setDataIds`, `setDataList`; a data call
  on something that is not a viewport; `'setStack' in viewport`, a read
  such as `typeof viewport.setStack === 'function'`, and their kin (false for
  every 6.0 viewport).

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/display-sets
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others, a JavaScript file too, in `tests/tsx`. Each `metrics.json` holds
the sites that a fixture reports.
