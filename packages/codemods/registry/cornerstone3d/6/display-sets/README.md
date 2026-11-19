# Cornerstone3D 6.0 Display Sets Migration

Rewrites the data calls of the legacy viewports to display sets. Step 3 of
the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-3-the-data).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-display-sets
```

## Changes

Only on a viewport that the file shows to come from Cornerstone: a call of
`getViewport` on a rendering engine made with `new RenderingEngine` or got
with `getRenderingEngine`, the `viewport` of `getEnabledElement`, a cast,
annotation or type argument of a Cornerstone viewport type, or a variable
that holds one of these (every `=` assignment of a `let` counts). A name such
as `viewport` alone is reported.

- `viewport.setStack(imageIds, index)` as a statement, on a viewport that is
  a name or a member chain, becomes:

  ```ts
  const displaySetId = `${viewport.renderingEngineId}:${viewport.id}:${imageIds[0]}`;
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: index,
  });
  await viewport.setDisplaySets({ displaySetId });
  ```

  The id names the rendering engine, the viewport and the first image:
  another series gets another id, so the viewport drops the segmentation
  overlays of the series before, and two engines with a viewport of one id
  never share a registration. The index is 0 when the call had none, as in
  5.x. An image list that is not a name, a literal or an index of those is
  read once into a fresh local first.

- `viewport.setVolumes([{ volumeId }])` and
  `setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds)` as
  statements become a registration under the volume id and
  `setDisplaySets({ displaySetId: volumeId })` on each viewport, when the
  file creates that volume with
  `volumeLoader.createAndCacheVolume(volumeId, { imageIds })` before the call,
  where the same `imageIds` binding is in scope. An engine that is not a name
  is read once into a fresh local, a list of viewport ids that is not a name
  goes in parentheses, and the callback parameter takes a name that the call
  does not use.
- `setVideo(imageId, frameNumber)` becomes
  `setDisplaySets({ displaySetId: imageId, options: { frameNumber } })`, and
  `setEcg(imageId)` `setDisplaySets({ displaySetId: imageId })`.
- The new mount waits (`await`) when the old call waited or when its function
  is `async`, so code after it sees the view.
- Statements that replace the single-statement body of an `if`, an `else`, a
  loop or a `case` go in a block.
- `utilities` comes from the existing core import, or under a fresh alias
  such as `coreUtilities` when a local name hides it at the call. An import
  with comments is edited in place.

## Reported

- Review: a mount in a function that is not `async` (a next viewport has no
  view before its mount).
- Manual, with the reason: a `setStack` that is not a statement, is an
  optional call (`viewport?.setStack`), or whose viewport is a call; a
  `setVolumes` input with `callback`, `blendMode`, `slabThickness`,
  `visibility` or `actorUID`, with more volumes, or whose image ids are not
  known; `addVolumes`, `addVolumesToViewports`,
  `convertStackToVolumeViewport`, `convertVolumeToStackViewport`,
  `removeVolumeActors`, `setWSI`, `setDataIds`, `setDataList`; a data call
  on something that the file does not show to be a Cornerstone viewport
  (by the name of the method); a reference to `setVolumesForViewports` that
  is not a call, such as a shorthand property (its import stays);
  `'setStack' in viewport`, a read such as
  `typeof viewport.setStack === 'function'`, and their kin (false for every
  6.0 viewport).
- A CommonJS module (`require('@cornerstonejs/core')`) gets no `import`: its
  calls are reported.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/display-sets
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others, a JavaScript file too, in `tests/tsx`. Each `metrics.json` holds
the sites that a fixture reports.
