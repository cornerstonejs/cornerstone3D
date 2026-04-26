---
id: migration
title: Migration
summary: Before and after examples for moving stack, volume, overlay, segmentation, and camera-style code to Next Viewport APIs
---

# Migration

This migration guide is local to the Next Viewport architecture. It is not a
general Cornerstone migration guide.

The goal is to move application code from viewport-class-specific behavior to
logical data ids, render paths, bindings, view state, and data presentation.

## Stack Or Volume Viewport Selection

Before, the viewport type usually encoded the data shape:

```ts
renderingEngine.enableElement({
  viewportId,
  type: Enums.ViewportType.STACK,
  element,
});

await viewport.setStack(imageIds);
```

```ts
renderingEngine.enableElement({
  viewportId,
  type: Enums.ViewportType.ORTHOGRAPHIC,
  element,
});

await viewport.setVolumes([{ volumeId }]);
```

Now, planar 2D viewing uses `PLANAR_NEXT`, and the data/render path decides
whether the source is stack-like or volume-slice-like:

```ts
renderingEngine.enableElement({
  viewportId,
  type: Enums.ViewportType.PLANAR_NEXT,
  element,
  defaultOptions: {
    renderMode: 'auto',
  },
});

const viewport = renderingEngine.getViewport(viewportId) as PlanarViewport;
```

## Stack Data

Before:

```ts
await stackViewport.setStack(imageIds, 0);
stackViewport.setProperties({
  voiRange: { lower: -1500, upper: 2500 },
});
stackViewport.render();
```

Now:

```ts
const dataId = 'ct-stack';

utilities.viewportNextDataSetMetadataProvider.add(dataId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDataList([
  {
    dataId,
    options: {
      renderMode: 'vtkImage',
    },
  },
]);

viewport.setDataPresentation(dataId, {
  voiRange: { lower: -1500, upper: 2500 },
});
viewport.render();
```

## Volume Slice Data

Before:

```ts
await volumeViewport.setVolumes([
  {
    volumeId,
    callback: ({ volumeActor }) => {
      volumeActor.getProperty().setRGBTransferFunction(0, cfun);
    },
  },
]);
```

Now:

```ts
const dataId = 'ct-volume';

utilities.viewportNextDataSetMetadataProvider.add(dataId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: Math.floor(imageIds.length / 2),
  volumeId,
  referencedId: volumeId,
});

await viewport.setDataList([
  {
    dataId,
    options: {
      orientation: Enums.OrientationAxis.AXIAL,
      renderMode: 'vtkVolumeSlice',
    },
  },
]);

viewport.setDataPresentation(dataId, {
  voiRange,
  colormap,
});
viewport.render();
```

## Fusion Overlays

Before, fusion often depended on volume actors, blend mode setup, and renderer
state owned by the viewport:

```ts
await volumeViewport.setVolumes([
  { volumeId: ctVolumeId },
  { volumeId: ptVolumeId },
]);

volumeViewport.setProperties(
  {
    colormap: { name: 'hsv' },
    voiRange: ptVoiRange,
  },
  ptVolumeId
);
```

Now, source and overlay are explicit data bindings:

```ts
await viewport.setDataList([
  {
    dataId: ctDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      renderMode: 'vtkVolumeSlice',
      role: 'source',
    },
  },
  {
    dataId: ptDataId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      renderMode: 'vtkVolumeSlice',
      role: 'overlay',
    },
  },
]);

viewport.setDataPresentation(ptDataId, {
  colormap: {
    name: 'hsv',
    opacity: 0.4,
  },
});
```

## Adding Overlay Images

Before:

```ts
viewport.addImages([
  {
    imageId,
    actorUID,
    callback: ({ imageActor }) => {
      imageActor.getProperty().setOpacity(0.5);
    },
  },
]);
```

Now, prefer registering overlay data and using data presentation:

```ts
utilities.viewportNextDataSetMetadataProvider.add(overlayDataId, {
  kind: 'planar',
  imageIds: [imageId],
  initialImageIdIndex: 0,
  referencedId: imageId,
  actorUID,
});

await viewport.addData(overlayDataId, {
  renderMode: 'vtkImage',
  role: 'overlay',
});

viewport.setDataPresentation(overlayDataId, {
  opacity: 0.5,
  visible: true,
});
```

The compatibility `addImages()` path still exists for image overlays, but new
code should use data ids and bindings directly.

## VOI, Colormap, Opacity, And Visibility

Before:

```ts
viewport.setProperties({
  voiRange,
  colormap,
  invert: true,
});
```

Now:

```ts
viewport.setDataPresentation(dataId, {
  voiRange,
  colormap,
  invert: true,
  visible: true,
});
```

This makes presentation explicitly per data binding, which matters when the
viewport has both source and overlay data.

## Pan, Zoom, Rotation, And Flips

Before, code often patched a camera object:

```ts
const camera = viewport.getCamera();

viewport.setCamera({
  ...camera,
  parallelScale: camera.parallelScale * 0.8,
});
```

Now, use semantic viewport APIs:

```ts
viewport.setScale(viewport.getScale() * 1.25);
viewport.setPan([40, -20]);
viewport.setViewPresentation({ rotation: 90 });
viewport.setViewState({ flipHorizontal: true });
viewport.render();
```

Legacy adapters still support camera-style calls for older code. Clean Next
code should use view state and presentation APIs.

## Slice Navigation

Before:

```ts
await stackViewport.setImageIdIndex(index);
```

```ts
volumeViewport.setCamera({
  focalPoint,
  position,
});
```

Now:

```ts
await viewport.setImageIdIndex(index);
```

For stack-backed data, this stores a stack index. For volume-backed data, the
viewport resolves the index into a volume slice point so the state has one slice
locator.

For spatial navigation across viewports:

```ts
const viewReference = sourceViewport.getViewReference();

targetViewport.setViewReference(viewReference);
targetViewport.render();
```

## Segmentations

Before, volume labelmaps commonly rendered as volume actors. That was useful for
some workflows, but it could allocate full 3D labelmap textures even for a
single-slice planar workflow.

```ts
await segmentation.addSegmentationRepresentations(viewportId, [
  {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  },
]);
```

Now, for compatible planar volume-slice workflows, enable slice rendering:

```ts
await segmentation.addLabelmapRepresentationToViewportMap({
  [viewportId]: [
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

With `useSliceRendering`, the labelmap representation is projected through the
image/slice overlay path. It follows the source view state as an overlay
binding, instead of requiring a separate volume-rendering overlay path.

## Recommended Migration Order

1. Move viewport creation to `ViewportType.PLANAR_NEXT` for planar 2D stack and
   volume-slice workflows.
2. Register each source or overlay as a logical data id.
3. Replace `setStack()` and `setVolumes()` with `setDataList()` or `addData()`.
4. Move VOI, colormap, opacity, blend mode, and visibility to
   `setDataPresentation(dataId, ...)`.
5. Replace clean-code camera patches with view state, view presentation, pan,
   zoom, and view reference APIs.
6. Enable `useSliceRendering` for labelmap segmentation overlays that should
   render through the slice path.
