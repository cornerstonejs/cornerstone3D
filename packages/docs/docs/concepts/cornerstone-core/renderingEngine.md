---
id: renderingEngine
title: Rendering Engine
---


# Rendering Engine

- 3D rendering of medical images

  - _New engine:_ We have re-architectured the rendering engine for Cornerstone which implemented a `WebGL` rendering, and have created a wrapper around [vtk.js](https://github.com/kitware/vtk-js)
  - _Shared Texture:_ Our rendering engine can optimally share textures between canvases, so for complex scenarios that may require > 10 viewports, we share the texture between the viewports that _might_ look into the same data from different
    angles (axial, sagittal, or coronal) or fuse them on top of each other.


A `RenderingEngine` allows the user to create Scenes with Viewports, associate these Viewports with onscreen canvases, and render data to these canvases using an offscreen WebGL canvas.

It should be noted that `RenderingEngine` is capable of rendering multiple viewports, and you don't need to
create multiple engines. However, multiple `RenderingEngine` instances can be created, in the case you wish to have a multiple monitor setup, and use a separate WebGL context to render each monitor’s viewports.

In Cornerstone-3D we have built the `RenderingEngine` from ground up, and we are utilizing [vtk.js](https://github.com/kitware/vtk-js) as the backbone of the rendering. vtk.js is a 3D rendering library capable of using WebGL and WebGPU for GPU-accelerated rendering.

## OnScreen and OffScreen Rendering
Previously in Cornerstone (legacy), we processed data in each viewport with a WebGL canvas. This doesn't scale well, as the number of viewports increases
and for complex imaging use cases (e.g., synced viewports), we will end up with lots
of updates to onscreen canvases and performance degrades as the number of viewports increases.

In `Cornerstone3D`, we process data in an offscreen canvas. This means that
we have a big invisible canvas (offscreen) that includes all the onscreen canvases inside itself.
As the user manipulates the data, the corresponding pixels in the offscreen
canvas get updated, and at render time, we copy from offscreen to onscreen for each viewport. Since the copying process is much faster than re-rendering each viewport upon manipulation, we have addressed the performance degradation problem.


## Shared Volume Mappers
`vtk.js` provides standard rendering functionalities which we use for rendering. In addition, in `Cornerstone3D` we have introduced `Shared Volume Mappers` to enable re-using the texture for any viewport that might need it without duplicating the data.

For instance for PET-CT fusion which has 3x3 layout which includes CT (Axial, Sagittal, Coronal), PET (Axial, Sagittal, Coronal) and Fusion (Axial, Sagittal, Coronal), we create two volume mappers for CT and PET individually, and for the Fusion viewports we re-use both created textures instead of re-creating a new one.


## General usage
After creating a renderingEngine, we can assign viewports to it for rendering. There are two main approach for creating `Stack` or `Volume` viewports which we will
discuss now.

### Viewport Input
Viewports (both stack and volume) are defined using their properties.  Viewport's public interface  can be seen below.

```js
type PublicViewportInput = {
  element: HTMLElement // Div element to render
  sceneUID?: string // Unique scene UID (optional for stackViewports)
  viewportId: string // Unique viewport UID
  type: string // Stack or Volume
  defaultOptions: ViewportInputOptions // Viewport options
}
```

Each viewport entry can accept a `viewportinputoptions` by which you can set the
`background` color (black by default), and `orientation` (Axial, Sagittal,
Coronal) of the viewport.


Now that you learned the properties of viewports, we explain how to use the
created instance of `renderingEngine` API and use it for rendering of the viewports.

### setViewports API
`setViewports` method is suitable for creation of a set of viewports at once.
After setting the array of viewports, the `renderingEngine` will adapt its
offScreen canvas size to the size of the provided canvases, and triggers the corresponding
events.

```js
import {
  RenderingEngine,
  ORIENTATION,
  ViewportType,
} from '@ohif/cornerstone-render'


const renderingEngineId = 'myEngine'
const renderingEngine = new RenderingEngine(renderingEngineId)


const viewportInput = [
  // CT Volume Viewport - Axial
  {
    sceneUID: 'ctScene',
    viewportId: 'ctAxial',
    type: ViewportType.ORTHOGRAPHIC,
    canvas: canvas1,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
  },
  // CT Volume Viewport - Sagittal
  {
    sceneUID: 'ctScene',
    viewportId: 'ctSagittal',
    type: ViewportType.ORTHOGRAPHIC,
    canvas: canvas2,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
    },
  },
  // CT Axial Stack Viewport
  {
    viewportId: 'ctStack',
    type: ViewportType.STACK,
    canvas: canvas3,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
  },
]

renderingEngine.setViewports(viewportInput)
```

### Enable/Disable API
For having a full control over enabling/disabling each viewport separately, you
can use the `enableElement` and `disableElement` API.


#### enableElement
it gets the `publicViewportEntry` as the input and enables the viewport for rendering.
After enabling the element, `renderingEngine` adapts its size and state with the new viewport
and a

```js
import {
  RenderingEngine,
  ORIENTATION,
  ViewportType,
} from '@ohif/cornerstone-render'


const renderingEngineId = 'myEngine'
const renderingEngine = new RenderingEngine(renderingEngineId)

const viewport = {
  sceneUID: 'ctScene',
  viewportId: 'ctAxial',
  type: ViewportType.ORTHOGRAPHIC,
  canvas: canvas1,
  defaultOptions: {
    orientation: ORIENTATION.AXIAL,
  },
}

renderingEngine.enableElement(viewport)
```



#### DisableElement
You can disable any viewport by using its `viewportId`, after disabling,
renderingEngine will resize its offScreen canvas.

```js
disableElement(viewportId: string)
```


[`element_enabled`](/docs/cornerstone-render/enums/Events#element_enabled) and
[`element_disabled`](/docs/cornerstone-render/enums/Events#element_enabled) events are fired
with below event detail.


```js
const eventDetail = {
  canvas,
  viewportId,
  renderingEngineId,
}
```
