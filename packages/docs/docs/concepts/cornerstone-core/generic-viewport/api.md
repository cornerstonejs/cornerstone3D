---
id: api
title: API
summary: Practical Generic Viewport API examples for data, overlays, presentation, navigation, and segmentation slice rendering
---

# API

The Generic Viewport API is centered on logical display set ids. Register the
display set once, mount it into a viewport, then update view state and data
presentation independently.

## Create A Planar Generic Viewport

Use `ViewportType.PLANAR_NEXT` for stack-like and volume-slice 2D workflows.
The viewport infers the render path from the registered dataset shape,
requested orientation, rendering configuration, WebGL support, and segmentation
slice-rendering configuration.

```ts
import {
  Enums,
  RenderingEngine,
  viewportProjection,
  utilities,
  type PlanarViewport,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('renderingEngineId');

renderingEngine.enableElement({
  viewportId: 'CT_AXIAL',
  type: Enums.ViewportType.PLANAR_NEXT,
  element,
  defaultOptions: {
    background: [0, 0, 0],
  },
});

const viewport = renderingEngine.getViewport('CT_AXIAL') as PlanarViewport;
```

Planar render-path selection is internal. Stack-like image-id data uses an
image path; volume-backed data or reformatted orientations use a volume slice
path. CPU/GPU choice is made by the planar render-path decision service from
runtime rendering configuration and thresholds.

## Add Stack Data

Register stack-like data with the metadata provider, then mount it with
`setDisplaySets()`.

```ts
const stackDisplaySetId = 'ct-stack';

utilities.genericViewportDataSetMetadataProvider.add(stackDisplaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDisplaySets({
  displaySetId: stackDisplaySetId,
});

viewport.setDisplaySetPresentation(stackDisplaySetId, {
  voiRange: { lower: -1500, upper: 2500 },
});

viewport.render();
```

`setDisplaySets()` is variadic; the first entry becomes the source binding
unless a role is provided explicitly. Each call replaces all currently mounted
display sets.

`setDisplaySets()` and `addDisplaySet()` do not return runtime rendering ids.
Use the `displaySetId` you provided for later presentation updates, removal,
and view-reference operations.

## Add Volume Slice Data

Volume slice data uses the same viewport API. The registered data includes a
`volumeId`, so the viewport selects a volume slice render path.

```ts
const ctDataId = 'ct-volume-source';

utilities.genericViewportDataSetMetadataProvider.add(ctDataId, {
  kind: 'planar',
  imageIds: ctImageIds,
  initialImageIdIndex: Math.floor(ctImageIds.length / 2),
  volumeId: ctVolumeId,
});

await viewport.setDisplaySets({
  displaySetId: ctDataId,
  options: {
    orientation: Enums.OrientationAxis.SAGITTAL,
  },
});
```

The same calls work for CPU or GPU volume slicing. Configure CPU/GPU preference
through rendering configuration and thresholds instead of passing a render mode
with the data.

## Add An Overlay

Overlays are additional data bindings mounted with `role: 'overlay'`. They use
the same viewport view state as the source but keep their own data presentation.

```ts
const ptDataId = 'pt-volume-overlay';

utilities.genericViewportDataSetMetadataProvider.add(ptDataId, {
  kind: 'planar',
  imageIds: ptImageIds,
  initialImageIdIndex: Math.floor(ptImageIds.length / 2),
  volumeId: ptVolumeId,
});

await viewport.addDisplaySet(ptDataId, {
  orientation: Enums.OrientationAxis.SAGITTAL,
  role: 'overlay',
});

viewport.setDisplaySetPresentation(ptDataId, {
  colormap: {
    name: 'hsv',
    opacity: 0.4,
  },
});

viewport.render();
```

`setDisplaySets()` can also mount source and overlays together:

```ts
await viewport.setDisplaySets(
  {
    displaySetId: ctDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      role: 'source',
    },
  },
  {
    displaySetId: ptDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      role: 'overlay',
    },
  }
);
```

Use `reference` only when the registered data is semantically derived from
another object. Source stack and volume data usually do not need it because
their `displaySetId`, `imageIds`, and optional `volumeId` are already the
public identity.

```ts
utilities.genericViewportDataSetMetadataProvider.add(labelmapDataId, {
  kind: 'planar',
  imageIds: labelmapImageIds,
  reference: {
    kind: 'segmentation',
    segmentationId,
    representationUID,
    labelmapId,
  },
});
```

## Update View State

Navigation and view appearance are separate from per-dataset appearance.
For direct Next viewports, `ViewState` is the only mutable viewport source of
truth. Use `setViewState()` for patches and `updateViewState()` for
read-modify-write changes. Use `resetViewState()` when you want the viewport
family's default navigation reset.

```ts
viewport.setViewState({
  flipHorizontal: true,
  rotation: 90,
});

viewport.updateViewState(({ rotation = 0 }) => ({
  rotation: rotation + 30,
}));

viewport.resetViewState();
```

Use viewport projection when the input is a portable presentation patch rather
rather than native view state. The projection service is pure: it returns the
next native `ViewState`, and the caller applies it.

```ts
const nextViewState = viewportProjection.withPresentation(viewport, {
  zoom: 1.5,
  pan: [40, -20],
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
viewport.render();
```

Read presentation through the same service:

```ts
const presentation = viewportProjection.getPresentation(viewport, {
  selector: {
    pan: true,
    zoom: true,
    rotation: true,
  },
});
```

Do not call `viewport.getViewPresentation()` or
`viewport.setViewPresentation()` on direct Next viewports. Those methods are
kept only on temporary legacy compatibility adapters and should be expected to
be removed from that compatibility layer in a later breaking release.

Use `setImageIdIndex()` for index-style navigation. For volume-backed data,
the viewport resolves the requested index into a volume slice point internally.

```ts
await viewport.setImageIdIndex(viewport.getCurrentImageIdIndex() + 1);
```

## Update Display Set Presentation

Display set presentation is scoped to one mounted display set id. Call
`setDisplaySetPresentation` with just `props` to apply the update to the
current source binding, or with an explicit `displaySetId` to target a
specific binding.

```ts
viewport.setDisplaySetPresentation(ctDataId, {
  voiRange: { lower: -1500, upper: 2500 },
});

viewport.setDisplaySetPresentation(ptDataId, {
  visible: false,
});

// Apply to the current source binding when the id is omitted.
viewport.setDisplaySetPresentation({
  voiRange: { lower: -1000, upper: 1000 },
});

viewport.render();
```

This is the preferred place for VOI, opacity, colormap, invert, blend mode,
interpolation, and visibility.

## Labelmap Segmentations

Segmentations are still added through `@cornerstonejs/tools`. For Next planar
volume-slice viewports, labelmaps can use slice rendering by setting
`config.useSliceRendering`.

```ts
import * as cornerstoneTools from '@cornerstonejs/tools';

const { segmentation, Enums: csToolsEnums } = cornerstoneTools;
const { SegmentationRepresentations } = csToolsEnums;

const segmentationId = 'segmentation-volume-id';

segmentation.addSegmentations([
  {
    segmentationId,
    representation: {
      type: SegmentationRepresentations.Labelmap,
      data: {
        volumeId: segmentationId,
      },
    },
  },
]);

await segmentation.addLabelmapRepresentationToViewportMap({
  CT_AXIAL: [
    {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
      config: {
        useSliceRendering: true,
      },
    },
  ],
});
```

With `useSliceRendering`, a compatible volume labelmap is rendered through an
image/slice path instead of allocating and drawing it as a full 3D labelmap
volume. This is useful for planar slice workflows, especially when the source
viewport is using a volume slice path.

The segmentation display tool registers each labelmap layer as overlay data in
the viewport:

```ts
await viewport.addDisplaySet(labelmapDataId, {
  orientation: viewport.getViewState().orientation,
  role: 'overlay',
});

viewport.setDisplaySetPresentation(labelmapDataId, {
  blendMode: Enums.BlendModes.COMPOSITE,
  visible: true,
});
```

Application code usually does not need to call this lower-level overlay path
directly for segmentations; it is shown here to explain how segmentations map
onto the Generic Viewport binding model.

## View References

Use view references when transferring spatial location between viewports or
restoring a remembered view.

```ts
const reference = viewport.getViewReference();

otherViewport.setViewReference(reference);
otherViewport.render();
```

Use projection presentation when only pan, zoom, rotation, flips, and display
area should be copied between compatible viewport families. The presentation
shape is adapter-specific, so this is appropriate for Planar Next to Planar
Next. Do not treat it as a universal cross-family camera copy; use view
references or a synchronizer that explicitly maps scale and position semantics
for that case.

```ts
const presentation = viewportProjection.getPresentation(viewport, {
  selector: {
    displayArea: true,
    flipHorizontal: true,
    flipVertical: true,
    pan: true,
    rotation: true,
    zoom: true,
  },
});

if (!presentation) {
  return;
}

// `withPresentation` is pure: it translates the presentation for the target
// viewport, but it does not mutate the target or schedule rendering.
const nextViewState = viewportProjection.withPresentation(
  otherViewport,
  presentation
);

if (nextViewState) {
  // `setViewState` remains the single mutation path for Next viewports.
  otherViewport.setViewState(nextViewState);
  otherViewport.render();
}
```
