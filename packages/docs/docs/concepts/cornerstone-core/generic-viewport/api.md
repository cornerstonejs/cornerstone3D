---
id: api
title: API
summary: Practical viewport API examples for data, overlays, appearance, framing, navigation, and segmentation slice rendering
---

# API

The viewport API is centered on logical display set ids. Register the
display set once, mount it into a viewport, then update view state and the appearance of
each display set independently.

## Create A Planar Viewport

Use `ViewportType.PLANAR` for stack-like and volume-slice 2D workflows.
The viewport infers the render path from the registered dataset shape,
requested orientation, rendering configuration, WebGL support, and segmentation
slice-rendering configuration.

```ts
import {
  Enums,
  RenderingEngine,
  viewportProjection,
  displaySetRegistry,
  type PlanarViewport,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('renderingEngineId');

renderingEngine.enableElement({
  viewportId: 'CT_AXIAL',
  type: Enums.ViewportType.PLANAR,
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

displaySetRegistry.add(stackDisplaySetId, {
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDisplaySets({
  displaySetId: stackDisplaySetId,
});

viewport.setDisplaySetAppearance(stackDisplaySetId, {
  voiRange: { lower: -1500, upper: 2500 },
});

viewport.render();
```

`setDisplaySets()` is variadic; the first entry becomes the source binding
unless a role is provided explicitly. Each call replaces all currently mounted
display sets.

`setDisplaySets()` and `addDisplaySet()` do not return runtime rendering ids.
Use the `displaySetId` you provided for later appearance updates, removal,
and view-reference operations.

## Add Volume Slice Data

Volume slice data uses the same viewport API. The mount asks for the volume
with `mode: 'volume'`, so the viewport selects a volume slice render path; an
orientation other than the acquisition plane shows a volume without it. The
`volumeId` of the registration names the volume in the cache and never chooses
the mode.

```ts
const ctDisplaySetId = 'ct-volume-source';

displaySetRegistry.add(ctDisplaySetId, {
  imageIds: ctImageIds,
  initialImageIdIndex: Math.floor(ctImageIds.length / 2),
  volumeId: ctVolumeId,
});

await viewport.setDisplaySets({
  displaySetId: ctDisplaySetId,
  options: {
    orientation: Enums.OrientationAxis.SAGITTAL,
    mode: 'volume',
  },
});
```

The same calls work for CPU or GPU volume slicing. Configure CPU/GPU preference
through rendering configuration and thresholds instead of passing a render mode
with the data.

## Add An Overlay

Overlays are additional data bindings mounted with `role: 'overlay'`. They use
the same viewport view state as the source but keep their own appearance.

```ts
const ptDisplaySetId = 'pt-volume-overlay';

displaySetRegistry.add(ptDisplaySetId, {
  imageIds: ptImageIds,
  initialImageIdIndex: Math.floor(ptImageIds.length / 2),
  volumeId: ptVolumeId,
});

await viewport.addDisplaySet(ptDisplaySetId, {
  orientation: Enums.OrientationAxis.SAGITTAL,
  role: 'overlay',
});

viewport.setDisplaySetAppearance(ptDisplaySetId, {
  colormap: {
    name: 'hsv',
  },
  opacity: 0.4,
});

viewport.render();
```

`setDisplaySets()` can also mount source and overlays together:

```ts
await viewport.setDisplaySets(
  {
    displaySetId: ctDisplaySetId,
    options: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      role: 'source',
    },
  },
  {
    displaySetId: ptDisplaySetId,
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
displaySetRegistry.add(labelmapDisplaySetId, {
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
For every viewport, `ViewState` is the only mutable viewport source of
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

Use viewport projection when the input is a portable framing patch rather
rather than native view state. The projection service is pure: it returns the
next native `ViewState`, and the caller applies it.

```ts
const nextViewState = viewportProjection.withFraming(viewport, {
  zoom: 1.5,
  pan: [40, -20],
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
viewport.render();
```

Read the framing through the same service:

```ts
const framing = viewportProjection.getFraming(viewport, {
  selector: {
    pan: true,
    zoom: true,
    rotation: true,
  },
});
```

`viewport.getViewFraming(selector)` and `viewport.setViewFraming(framing)`
read and write the same framing on the viewport. They replace the
`getViewPresentation()` and `setViewPresentation()` of the 5.x legacy
viewports.

Use `setImageIdIndex()` for index-style navigation. For volume-backed data,
the viewport resolves the requested index into a volume slice point internally.

```ts
await viewport.setImageIdIndex(viewport.getCurrentImageIdIndex() + 1);
```

## Update Display Set Appearance

The appearance of a display set is scoped to one mounted display set id. Call
`setDisplaySetAppearance` with just `props` to apply the update to the
current source binding, or with an explicit `displaySetId` to target a
specific binding.

```ts
viewport.setDisplaySetAppearance(ctDisplaySetId, {
  voiRange: { lower: -1500, upper: 2500 },
});

viewport.setDisplaySetAppearance(ptDisplaySetId, {
  visible: false,
});

// Apply to the current source binding when the id is omitted.
viewport.setDisplaySetAppearance({
  voiRange: { lower: -1000, upper: 1000 },
});

viewport.render();
```

This is the preferred place for VOI, opacity, colormap, invert, blend mode,
interpolation, and visibility.

## Labelmap Segmentations

Segmentations are still added through `@cornerstonejs/tools`. For planar
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
await viewport.addDisplaySet(labelmapDisplaySetId, {
  orientation: viewport.getViewState().orientation,
  role: 'overlay',
});

viewport.setDisplaySetAppearance(labelmapDisplaySetId, {
  blendMode: Enums.BlendModes.COMPOSITE,
  visible: true,
});
```

Application code usually does not need to call this lower-level overlay path
directly for segmentations; it is shown here to explain how segmentations map
onto the viewport binding model.

## View References

Use view references when transferring spatial location between viewports or
restoring a remembered view.

```ts
const reference = viewport.getViewReference();

otherViewport.setViewReference(reference);
otherViewport.render();
```

Use the framing when only pan, zoom, rotation, flips, and display
area should be copied between compatible viewport families. The framing
shape is adapter-specific, so this is appropriate for planar to planar. Do not treat it as a universal cross-family camera copy; use view
references or a synchronizer that explicitly maps scale and position semantics
for that case.

```ts
const framing = viewportProjection.getFraming(viewport, {
  selector: {
    displayArea: true,
    flipHorizontal: true,
    flipVertical: true,
    pan: true,
    rotation: true,
    zoom: true,
  },
});

if (!framing) {
  return;
}

// `withFraming` is pure: it translates the framing for the target
// viewport, but it does not mutate the target or schedule rendering.
const nextViewState = viewportProjection.withFraming(otherViewport, framing);

if (nextViewState) {
  // `setViewState` remains the single mutation path for viewports.
  otherViewport.setViewState(nextViewState);
  otherViewport.render();
}
```
