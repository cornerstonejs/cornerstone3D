---
id: data-bindings-and-loading
title: Data Bindings And Loading
summary: How Next Viewport data providers, bindings, and presentation state work together
---

# Data Bindings And Loading

Next viewports separate loading, binding, viewport navigation, and render
appearance.

The viewport asks its `DataProvider` to load a logical data id. The loaded data
is passed to the selected render path, and the render path returns a
`ViewportDataBinding`. The binding contains the mounted runtime rendering plus
callbacks for view state, data presentation, rendering, resize, and cleanup.

## Data Provider

A data provider converts an application-level data id into loaded data. For
planar viewports this may resolve image ids, volumes, acquisition orientation,
metadata, and the internally selected effective render path. The loaded object
describes the data; it does not own viewport navigation.

## Viewport Data Binding

A binding represents one mounted data/render-path pair. It has a role:

- `source` defines the active view used by the viewport.
- `overlay` draws additional data aligned to the source.

Bindings receive `applyViewState(viewState)` whenever the viewport navigation
state changes. This replaces the older `updateCamera()` language because the
binding is applying viewport state, not owning camera truth.

The viewport keeps bindings keyed by data id. That means tools and application
code can update a single mounted dataset without reaching into actors or mapper
objects:

```ts
viewport.setDataPresentation(petDataId, {
  visible: false,
});

viewport.render();
```

## Presentation Split

Viewport state and data presentation have different ownership:

- `viewState` is local viewport navigation and layout state.
- `DataPresentation` is per-binding appearance such as VOI, opacity, colormap,
  interpolation, visibility, or playback presentation.

This split lets one viewport pan, zoom, rotate, and navigate once while multiple
bindings render with their own appearance settings.

## Segmentation Bindings

Labelmap segmentations use the same binding model. The segmentation display
tool creates or resolves labelmap data, registers it as planar data, and mounts
it as an overlay binding. When `useSliceRendering` is enabled, compatible
volume labelmaps render through the slice/image overlay path instead of the
legacy volume-labelmap actor path.

```ts
await segmentation.addLabelmapRepresentationToViewportMap({
  [viewportId]: [
    {
      segmentationId,
      config: {
        useSliceRendering: true,
      },
    },
  ],
});
```

Internally, that representation maps to overlay data:

```ts
await viewport.addData(labelmapDataId, {
  orientation: viewport.getViewState().orientation,
  role: 'overlay',
});
```

The segmentation remains owned by the tools segmentation state. The viewport
only owns the mounted overlay binding used to render it.

## Loading Flow

The typical flow is:

1. The viewport infers the render path from dataset shape, orientation, and
   rendering configuration.
2. The viewport calls `dataProvider.load(dataId, options)` with that internal
   decision.
3. The render path resolver selects the runtime path for the loaded data.
4. The render path mounts runtime resources and returns a binding.
5. The viewport stores the binding with its data id and role.
6. The viewport pushes current `viewState` and data presentation into the
   binding.
7. The binding projects that state into renderer commands during render or
   resize.

The viewport remains the owner of navigation state throughout this flow.
