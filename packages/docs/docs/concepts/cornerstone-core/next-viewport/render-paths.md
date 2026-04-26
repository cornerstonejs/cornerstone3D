---
id: render-paths
title: Render Paths
summary: How Next Viewport render paths select runtime implementations and project resolved views into renderer commands
---

# Render Paths

A render path is the runtime implementation that knows how to draw one logical
data type in one render mode. The viewport chooses a render path when data is
added, then the binding returned by that path receives view and presentation
updates from the viewport.

Examples include:

- CPU image slice rendering for stack images.
- CPU volume slice rendering for volume data.
- VTK image mapper rendering.
- VTK volume slice rendering.
- DOM video element rendering.
- Canvas ECG waveform rendering.

## Selection

Render path selection starts from the requested viewport type, logical data,
dataset shape, requested orientation, and rendering configuration. A
viewport-specific decision service chooses the effective path, then the
`RenderPathResolver` returns the first registered path that matches the loaded
data and internal decision. The selected path can also narrow the root viewport
render context into the runtime context it needs.

For planar viewports, stack-like image ids select an image path, while
volume-backed data and reformatted orientations select a volume slice path.
CPU/GPU selection comes from rendering configuration, thresholds, and runtime
support. Source vs overlay role is not used to decide the render path.

## Projection

Render paths do not own viewport navigation truth. They receive the viewport
`viewState` through `applyViewState()` and use the viewport-resolved data to
apply renderer-specific commands.

Planar render paths project a resolved planar view into:

- VTK camera fields for VTK image and volume slice rendering.
- CPU transform information for CPU image and CPU volume rendering.
- A shared active source `ICamera` used by overlays for alignment and sampling.
- Slice/image overlay commands for compatible labelmap segmentation rendering.

Video and ECG render paths resolve a canvas mapping from semantic state, element
or canvas dimensions, and data metrics. That mapping provides canvas/world
transforms and DOM or canvas drawing offsets.

## Source And Overlay Ownership

The source binding defines the active resolved view for the viewport. Overlay
bindings receive the same `viewState`, but they do not replace the active source
view. In planar rendering, only the source binding writes
`ctx.view.activeSourceICamera`; overlays read it only to align sampling or
actors to the source.

This is also how segmentation slice rendering works. The source volume slice
defines the active view. The labelmap representation is mounted as an overlay
binding and rendered through the slice path when `useSliceRendering` is enabled.
It follows source navigation without becoming the source view.

## Adding A Render Path

When adding a new render path:

- Match only the data type and internal render-path decision the path can
  actually draw.
- Keep persistent navigation state on the viewport.
- Implement `applyViewState()` as a projection from semantic state to runtime
  commands.
- Keep appearance settings in data presentation, not view state.
- Return cleanup through `removeData()` so runtime resources are owned by the
  binding that created them.
