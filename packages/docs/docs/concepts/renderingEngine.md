---
id: renderingEngine
title: Rendering Engine
---


# Rendering Engine

A `RenderingEngine` allows the user to create Scenes with Viewports, associate these Viewports with onscreen canvases, and render data to these canvases using an offscreen WebGL canvas.

It should be noted that `RenderingEngine` is capable of rendering multiple viewports, and you don't need to
create multiple engines. However, multiple `RenderingEngine` instances can be created, in the case you wish to have a multiple monitor setup, and use a separate WebGL context to render each monitor’s viewports.

In Cornerstone-3D we have built the `RenderingEngine` from ground up, and we are utilizing [vtk.js](https://github.com/kitware/vtk-js) as the backbone of the rendering. vtk.js is a 3D rendering library capable of using WebGL and WebGPU for GPU-accelerated rendering.

## OnScreen and OffScreen Rendering
Previously in Cornerstone (legacy), we processed data in each viewport with a WebGL canvas. This doesn't scale well, as the number of viewports increases
and for complex imaging use cases (e.g., synced viewports), we will end up with lots
of updates to onscreen canvases and performance degrades as the number of viewports increases.

In `Cornerstone-3D`, we process data in an offscreen canvas. This means that
we have a big invisible canvas (offscreen) that includes all the onscreen canvases inside itself.
As the user manipulates the data, the corresponding pixels in the offscreen
canvas get updated, and at render time, we copy from offscreen to onscreen for each viewport. Since the copying process is much faster than re-rendering each viewport upon manipulation, we have addressed the performance degradation problem.


## Shared Volume Mappers
`vtk.js` provides standard rendering functionalities which we use for rendering. In addition, in `Cornerstone-3D` we have introduced `Shared Volume Mappers` to enable re-using the texture for any viewport that might need it without duplicating the data.

For instance for PET-CT fusion which has 3x3 layout which includes CT (Axial, Sagittal, Coronal), PET (Axial, Sagittal, Coronal) and Fusion (Axial, Sagittal, Coronal), we create two volume mappers for CT and PET individually, and for the Fusion viewports we re-use both created textures instead of re-creating a new one.
