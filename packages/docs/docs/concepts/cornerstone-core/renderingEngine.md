---
id: renderingEngine
title: Rendering Engine
summary: Core rendering component that manages viewports and their HTML elements, utilizing offscreen WebGL canvas for efficient GPU-accelerated rendering of medical images
---

# Rendering Engine

A `RenderingEngine` allows the user to create Viewports, associate these Viewports with onscreen HTML elements, and render data to these elements using an offscreen WebGL canvas.

It should be noted that `RenderingEngine` is capable of rendering multiple viewports, and you don't need to
create multiple engines. However, multiple `RenderingEngine` instances can be created, e.g., if you wish to have a multiple monitor setup, and use a separate WebGL context to render each monitor’s viewports.

In `Cornerstone3D` we have built the `RenderingEngine` from ground up, and we are utilizing [vtk.js](https://github.com/kitware/vtk-js) as the backbone of the rendering. `vtk.js` is a 3D rendering library capable of using WebGL for GPU-accelerated rendering.

## OnScreen and Offscreen Rendering

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

## Rendering Engine Implementations

Cornerstone3D provides two rendering engine implementations to handle different use cases and overcome technical limitations:

### TiledRenderingEngine

The `TiledRenderingEngine` is the original implementation that uses a single, large offscreen canvas for all viewports. This approach:

- Creates one massive offscreen canvas that grows horizontally as viewports are added
- Renders all viewports to specific coordinates on this single offscreen canvas
- Copies pixel data from the offscreen canvas to individual onscreen viewports

**Limitations of TiledRenderingEngine:**

- **Canvas Size Limits**: Browsers impose maximum canvas dimensions (e.g., 16,384px in Chrome). When the combined width of all viewports exceeds this limit, the offscreen canvas is silently cropped, causing severe visual artifacts, misaligned viewports, and blank viewports
- **Performance Degradation**: As the offscreen canvas approaches size limits, performance degrades significantly, especially on high-resolution displays or layouts with many viewports
- **Multi-Monitor Issues**: Practically impossible to use across multiple high-resolution monitors due to canvas size limitations
- **Memory Consumption**: Allocates a huge, memory-intensive offscreen canvas regardless of actual viewport usage

**Advantages of TiledRenderingEngine:**

- **Simplicity**: Straightforward implementation that works well for small numbers of viewports
- **Track Record**: Proven reliability for 5 years, and for most basic use cases, it performs adequately

### ContextPoolRenderingEngine (SequentialRenderingEngine)

The `ContextPoolRenderingEngine` (internally called `SequentialRenderingEngine`) fundamentally solves the limitations of the tiled approach by using a different rendering strategy:

- Renders each viewport individually to a viewport-sized offscreen canvas
- Copies the result to the corresponding onscreen canvas
- Proceeds sequentially to the next viewport, reusing the same offscreen canvas
- Utilizes WebGL context pooling to render in batches (e.g., batches of 8 for 8 WebGL contexts)

**Advantages of ContextPoolRenderingEngine:**

- **No Canvas Size Limits**: The browser's maximum canvas size now applies to individual viewports, not the combined width
- **Improved Performance**: Consistent performance regardless of the number of viewports or display resolution
- **Better Memory Usage**: Avoids allocating massive offscreen canvases
- **Multi-Monitor Support**: Enables smooth performance across multiple high-resolution monitors
- **Enhanced Stability**: Reduces WebGL context loss associated with huge canvas surfaces

### Configuring the Rendering Engine

The `ContextPoolRenderingEngine` is now the default in Cornerstone3D. If you need to use the legacy `TiledRenderingEngine`, you can configure it during initialization:

```js
import { init } from '@cornerstonejs/core';

// To use the legacy TiledRenderingEngine
init({
  rendering: {
    renderingEngineMode: 'standard',
  },
});

// The ContextPoolRenderingEngine is used by default, or you can explicitly set it
init({
  rendering: {
    renderingEngineMode: 'next',
  },
});
```

For `ContextPoolRenderingEngine` you can also configure the number of WebGL contexts to use for batch rendering:

```js
import { init } from '@cornerstonejs/core';

// To use the ContextPoolRenderingEngine with a specific number of WebGL contexts
init({
  rendering: {
    renderingEngineMode: 'next',
    webGLContextCount: 7, // Default is 7, can be adjusted based on your needs
  },
});
```

## General usage

After creating a renderingEngine, we can assign viewports to it for rendering. There are two main approach for creating `Stack` or `Volume` viewports which we will discuss now.

### Instantiating a `RenderingEngine`

You can instantiate a `RenderingEngine` by calling the `new RenderingEngine()` method.

```js
import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngineId = 'myEngine';
const renderingEngine = new RenderingEngine(renderingEngineId);
```

### Viewport Creation

You can then use two methods to create viewports: `setViewports` or `enable/disable` APIs.
For both methods, a ViewportInput object is passed as an argument.

```js
PublicViewportInput = {
  /** HTML element in the DOM */
  element: HTMLDivElement
  /** unique id for the viewport in the renderingEngine */
  viewportId: string
  /** type of the viewport VolumeViewport or StackViewport*/
  type: ViewportType
  /** options for the viewport */
  defaultOptions: ViewportInputOptions
}
```

#### setViewports API

`setViewports` method is suitable for creation of a set of viewports at once.
After setting the array of viewports, the `renderingEngine` will adapt its
offScreen canvas size to the size of the provided canvases, and triggers the corresponding
events.

```js
const viewportInput = [
  // CT Volume Viewport - Axial
  {
    viewportId: 'ctAxial',
    type: ViewportType.ORTHOGRAPHIC,
    element: htmlElement1,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
    },
  },
  // CT Volume Viewport - Sagittal
  {
    viewportId: 'ctSagittal',
    type: ViewportType.ORTHOGRAPHIC,
    element: htmlElement2,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
    },
  },
  // CT Axial Stack Viewport
  {
    viewportId: 'ctStack',
    type: ViewportType.STACK,
    element: htmlElement3,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
    },
  },
];

renderingEngine.setViewports(viewportInput);
```

#### Enable/Disable API

For having a full control over enabling/disabling each viewport separately, you
can use the `enableElement` and `disableElement` API. After enabling the element,
`renderingEngine` adapts its size and state with the new element.

```js
const viewport = {
  viewportId: 'ctAxial',
  type: ViewportType.ORTHOGRAPHIC,
  element: element1,
  defaultOptions: {
    orientation: Enums.OrientationAxis.AXIAL,
  },
};

renderingEngine.enableElement(viewport);
```

You can disable any viewport by using its `viewportId`, after disabling,
renderingEngine will resize its offScreen canvas.

```js
renderingEngine.disableElement(viewportId: string)
```
