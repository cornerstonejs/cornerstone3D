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
with `getRenderingEngine`, the `viewport` of `getEnabledElement`, a cast or
annotation whose top type is a Cornerstone viewport type, or a `const` (or a
parameter that the file never writes) that holds one of these. A name such
as `viewport` alone, a `let`, a `var` and a container type such as
`History<Types.IViewport>` are reported.

- `viewport.setStack(imageIds, index)` as a statement, on a viewport that is
  a name or a member chain, becomes:

  ```ts
  const displaySetId = JSON.stringify([
    viewport.renderingEngineId,
    viewport.id,
    imageIds[0],
  ]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: index,
  });
  await viewport.setDisplaySets({ displaySetId });
  ```

  The id is the JSON of the rendering engine id, the viewport id and the
  first image id: another series gets another id, so the viewport drops the
  segmentation overlays of the series before, and two engines with a
  viewport of one id never share a registration. JSON keeps the three parts
  apart, so engine `'a:b'` with viewport `'c'` and engine `'a'` with viewport
  `'b:c'` get two ids. The index is 0 when the call had none, as in 5.x. A
  viewport that is a member chain (`holder.viewport`, `this.viewport`, the
  `viewport` of an enabled element), which can be a getter, is read once
  into a fresh `const` first, and so is a name that a write can change (a
  `let`, a `var`, a written parameter) when an argument is not a name, a
  literal or an array of those: a getter or a call in it can assign the
  name, and the old call had read the viewport before its arguments. An
  image list that is not a name, a literal or an array of those (a property
  read, an index, a call) is read once into a fresh `const` after it, as
  the old call read each once and in that order.

- `viewport.setVolumes([{ volumeId }])` and
  `setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds)` as
  statements become a registration under the volume id and
  `setDisplaySets({ displaySetId: volumeId })` on each viewport, when the
  function of the call creates that volume with
  `volumeLoader.createAndCacheVolume(volumeId, { imageIds })` in a statement
  that runs before the call on every path: an expression statement or a
  declaration, not a part of a loop or of an `if` (the increment of a `for`
  that its body leaves with `break` never runs). The volume id is a string
  or a `const` (or an unwritten parameter), the same binding at the creation
  and at the call, and `imageIds` is such a name in scope at the call. The
  options of the creation have no computed key (`['imageIds']`, `[key]`)
  and one `imageIds` only: the loader takes the last entry.
- `setVolumesForViewports` looks up and checks every viewport first and
  throws, as 5.x did, before the registration and before any mount when one
  is missing or is not planar or 3D (5.x took only viewports with
  `setVolumes`):

  ```ts
  const viewports = viewportIds.map((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    if (
      viewport.type !== Enums.ViewportType.PLANAR &&
      viewport.type !== Enums.ViewportType.VOLUME_3D
    ) {
      throw new Error(
        'setVolumesForViewports only supports viewports that implement setVolumes'
      );
    }

    return viewport;
  });

  utilities.genericViewportDisplaySetMetadataProvider.add(volumeId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  await Promise.all(
    viewports.map((viewport) =>
      viewport.setDisplaySets({ displaySetId: volumeId })
    )
  );
  ```

  An engine that is not a name is read once into a fresh local, a list of
  viewport ids that is not a name goes in parentheses, and the callback
  names are names that the call does not use.

- `setVideo(imageId, frameNumber)` becomes
  `setDisplaySets({ displaySetId: imageId, options: { frameNumber } })`, and
  `setEcg(imageId)` `setDisplaySets({ displaySetId: imageId })`.
- Each of these calls is rewritten only where the code waits for it, and the
  new mount is waited for in the same way: `setStack`, `setVolumes` and
  `setVolumesForViewports` as an `await` statement; `setVideo` and `setEcg`
  under `await`, as the value of a `return` or as the body of an arrow
  function (the caller gets the promise).
- Statements that replace the single-statement body of an `if`, an `else`, a
  loop or a `case` go in a block.
- `utilities` and `Enums` come from the existing core import, or under a
  fresh alias such as `coreUtilities` when a local name hides them at the
  call. An import with comments is edited in place.

## Reported

- Manual, with the reason `not awaited`: a `setStack`, `setVolumes`,
  `setVideo` or `setEcg` that the code does not wait for, in any function,
  `async` or not; for `setVideo` and `setEcg` also a call under `void`, with
  `.then(...)`, held in a variable or passed as an argument (also to
  `Promise.all`). The 5.x call set part of the view before its
  promise (the image ids and the index of a stack, the image id, frame count
  and source of a video, the image id of an ECG; a volume viewport had a
  camera before its data), so the code after it saw that part. A 6.0
  viewport shows nothing before its mount ends: `await` would change when
  the code after runs, and a mount without `await` would leave that code an
  empty viewport (`stackPrefetch.enable` right after `setStack` finds no
  images). Which one the code needs is for the reader.
- Manual, with the reason: a `setStack` that is not a statement, is an
  optional call (`viewport?.setStack`), has a spread argument, or whose
  viewport is a call; a `setVolumes` input with `callback`, `blendMode`,
  `slabThickness`, `visibility` or `actorUID`, with more volumes, a volume
  id that is not a string or a `const`, or whose image ids are not known (no
  creation of the same volume id on every path before it in its function,
  or options with a computed key or two `imageIds`); a
  `setVolumesForViewports` that is not awaited (5.x gave a promise that the
  code did not wait for, so the code after it ran before the mounts, and
  the new statements would wait for every mount or throw); a data member in
  brackets (`viewport['setStack']`); an `export { ... } from` of a removed
  data function; `addVolumes`, `addVolumesToViewports`,
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
- Manual, at line 1: `the file was not analysed:` with the reason, for a
  file whose names cannot be looked up (the tool cannot read it, or a name
  is declared twice in one scope). The file stays as it is. See the README
  of `@cornerstonejs/cornerstone3d-6`.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/display-sets
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others, a JavaScript file too, in `tests/tsx`. Each `metrics.json` holds
the sites that a fixture reports.
