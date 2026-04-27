---
id: api
title: API
summary: Practical Next Viewport API examples for data, overlays, presentation, navigation, and segmentation slice rendering
---

# API

The Next Viewport API is centered on logical data ids. Register the data once,
mount it into a viewport, then update view state and data presentation
independently.

## Create A Planar Next Viewport

Use `ViewportType.PLANAR_NEXT` for stack-like and volume-slice 2D workflows.
The viewport infers the render path from the registered dataset shape,
requested orientation, rendering configuration, WebGL support, and segmentation
slice-rendering configuration.

```ts
import {
  Enums,
  RenderingEngine,
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
`setDataList()`.

```ts
const stackDataId = 'ct-stack';

utilities.viewportNextDataSetMetadataProvider.add(stackDataId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDataList([
  {
    dataId: stackDataId,
  },
]);

viewport.setDataPresentation(stackDataId, {
  voiRange: { lower: -1500, upper: 2500 },
});

viewport.render();
```

The first entry in `setDataList()` becomes the source binding unless a role is
provided explicitly.

`setDataList()`, `setData()`, and `addData()` do not return runtime rendering
ids. Use the `dataId` you provided for later presentation updates, removal, and
view-reference operations.

## Add Volume Slice Data

Volume slice data uses the same viewport API. The registered data includes a
`volumeId`, so the viewport selects a volume slice render path.

```ts
const ctDataId = 'ct-volume-source';

utilities.viewportNextDataSetMetadataProvider.add(ctDataId, {
  kind: 'planar',
  imageIds: ctImageIds,
  initialImageIdIndex: Math.floor(ctImageIds.length / 2),
  volumeId: ctVolumeId,
});

await viewport.setDataList([
  {
    dataId: ctDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
    },
  },
]);
```

The same calls work for CPU or GPU volume slicing. Configure CPU/GPU preference
through rendering configuration and thresholds instead of passing a render mode
with the data.

## Add An Overlay

Overlays are additional data bindings mounted with `role: 'overlay'`. They use
the same viewport view state as the source but keep their own data presentation.

```ts
const ptDataId = 'pt-volume-overlay';

utilities.viewportNextDataSetMetadataProvider.add(ptDataId, {
  kind: 'planar',
  imageIds: ptImageIds,
  initialImageIdIndex: Math.floor(ptImageIds.length / 2),
  volumeId: ptVolumeId,
});

await viewport.addData(ptDataId, {
  orientation: Enums.OrientationAxis.SAGITTAL,
  role: 'overlay',
});

viewport.setDataPresentation(ptDataId, {
  colormap: {
    name: 'hsv',
    opacity: 0.4,
  },
});

viewport.render();
```

`setDataList()` can also mount source and overlays together:

```ts
await viewport.setDataList([
  {
    dataId: ctDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      role: 'source',
    },
  },
  {
    dataId: ptDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      role: 'overlay',
    },
  },
]);
```

Use `reference` only when the registered data is semantically derived from
another object. Source stack and volume data usually do not need it because
their `dataId`, `imageIds`, and optional `volumeId` are already the public
identity.

```ts
utilities.viewportNextDataSetMetadataProvider.add(labelmapDataId, {
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

```ts
viewport.setViewState({
  flipHorizontal: true,
});

viewport.setViewPresentation({
  rotation: 90,
});

viewport.setScale(1.5);
viewport.setPan([40, -20]);
viewport.render();
```

Use `setImageIdIndex()` for index-style navigation. For volume-backed data,
the viewport resolves the requested index into a volume slice point internally.

```ts
await viewport.setImageIdIndex(viewport.getCurrentImageIdIndex() + 1);
```

## Update Data Presentation

Data presentation is scoped to one mounted data id.

```ts
viewport.setDataPresentation(ctDataId, {
  voiRange: { lower: -1500, upper: 2500 },
});

viewport.setDataPresentation(ptDataId, {
  visible: false,
});

viewport.render();
```

This is the preferred place for VOI, opacity, colormap, blend mode,
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
await viewport.addData(labelmapDataId, {
  orientation: viewport.getViewState().orientation,
  role: 'overlay',
});

viewport.setDataPresentation(labelmapDataId, {
  blendMode: Enums.BlendModes.COMPOSITE,
  visible: true,
});
```

Application code usually does not need to call this lower-level overlay path
directly for segmentations; it is shown here to explain how segmentations map
onto the Next Viewport binding model.

## View References

Use view references when transferring spatial location between viewports or
restoring a remembered view.

```ts
const reference = viewport.getViewReference();

otherViewport.setViewReference(reference);
otherViewport.render();
```

Use view presentation when only pan, zoom, rotation, flips, and display area
should be copied.

```ts
const presentation = viewport.getViewPresentation();

otherViewport.setViewPresentation(presentation);
otherViewport.render();
```
