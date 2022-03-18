---
id: migrationGuides
---

# Migration Guides

Here are the migration guides from Cornerstone-2D to Cornerstone-3D


### enabledElement

Enabled elements in this framework don’t exist in isolation as in Cornerstone. When setting a layout, canvases are tied to a rendering engine as output targets. When this happens they are considered “enabled”.


In Cornerstone we had:

```js
const element = document.getElementById('div-element');
cornerstone.enable(element);

// Triggers ELEMENT_ENABLED event
```

In Cornerstone-3D you have two APIs for this:
- `setViewports`: enables a list of viewports at once
- `enableElement`: enables the element

```js
const canvas = document.getElementById('canvas-element');
const renderingEngine = new RenderingEngine();

// For Constants, see Example below
renderingEngine.setViewports([
 {
    sceneUID: "CT",
    viewportUID: "CTAxial",
    type: ViewportType.ORTHOGRAPHIC,
    canvas,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
 }
]);

renderingEngine.enableElement(
 {
    sceneUID: "CT",
    viewportUID: "CTAxial",
    type: ViewportType.ORTHOGRAPHIC,
    canvas,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
 }
);

// ELEMENT_ENABLED eventDetail includes:
{
  canvas,
  sceneUID,
  viewportUID,
  renderingEngineUID,
}
```

### loadAndCacheImage


In Cornerstone-3D, first, a volume is defined (similar to “stacks” in Cornerstone), and memory for this volume is allocated, then the user can trigger a load to fetch the data. As the data corresponding to each imageId is fetched and decoded, the volume is filled up with data, the callback is called as each frame returns, and the eventDetail given to the callback is shown in the example.

We are still using `cornerstoneWADOImageLoader` to process requests, but are instead filling up a volume instead of creating individual Cornerstone images.


In Cornerstone we had:


```js
cornerstone.loadAndCacheImage(imageId).then(image => {
  // Do things, e.g. display an image
});
```


In Cornerstone-3D for loading images we have

```js

const viewport = renderingEngine.getViewport('CTViewport')

// one image in the stack
await viewport.setStack(
  [imageId],
)

// multiple imageIds
await viewport.setStack(
  [imageId1, imageId2],
  1, // frame 1
)
```

For loading volumes we have

```js
// Define a set of imageIds as a volume.
const ctVolume = await createAndCacheVolume(
  volumeUID,
  { imageIds: volumeImageIds}
)

// Load the volume, the callback is called for each imageId
ctVolume.load(callback)
```

Where eventDetail passed to the callback is (currently) of the form:

```
// Success:
{
  success: true,
  imageIdIndex, // The in-volume Z index
  imageId, // The imageId
  framesLoaded, // The total number of frames successfully loaded
  framesProcessed, // The total number of frames processed (successes + failures)
  numFrames, // The total number of frames in the volume.
}

// Failure:
{
  success: false,
  imageId,
  imageIdIndex,
  framesLoaded,
  framesProcessed,
  numFrames,
  error, // The error given by the imageLoader
}
```


### displayImage
This is a bit different in that you now set the data per scene rather than per element, as in Cornerstone.

When a viewport is later rendered, you are returned the viewport instance, which has helpers to access the canvas element, the renderer, the scene data, etc.


In Cornerstone we had:

```js
cornerstone.displayImage(image, element);

// Triggers cornerstone.events.IMAGE_RENDERED
// with eventDetail as follows
const eventDetail = {
  viewport: enabledElement.viewport,
  element,
  image,
  enabledElement,
  canvasContext: enabledElement.canvas.getContext('2d'),
  renderTimeInMs
}
```

In Cornerstone-3D we have:

```js
fusionScene.setVolumes([
  { volumeUID: ctVolumeUID, callback: setCTWWWC },
  { volumeUID: ptVolumeUID, callback: setPetFusionColorMapTransferFunction },
]);
```

on IMAGE_RENDERED

```js
eventDetail: {
  viewport,
}

viewport.render()
```


### updateImage
We have effectively the same approach right now, but we have three different helpers that can be called to render:

- All viewports associated with a rendering engine.
- All viewports associated displaying a scene.
- A single viewport.

These are useful convenience helpers when using tools that may affect multiple viewports that all need to update (e.g. jump to a crosshair position on all three orthogonal MPR views).

These are also present for performance benefits. Rendering a scene is more efficient that calling render on all its canvases individually, as internally to the engine this is implemented as a single render, with a copy of part of the image to each on-screen canvas.

In Cornerstone we had:

```js
cornerstone.updateImage(
  element,
  invalidated
);
```

In Cornerstone-3D we have:

```js
// Updates every viewport in the rendering engine.
renderingEngine.render()

// Updates every viewport displaying the scene.
const myScene = renderingEngine.getScene('mySceneUID');
myScene.render();

// Update a single viewport
const myViewport = myScene.getViewport('myViewportUID');
myViewport.render();
```

on IMAGE_RENDERED event fired for all viewports:

```js
eventDetail: {
  viewport,
}
```


### disable
The rendering engine controls when viewports are enabled/disabled, and will fire appropriate events as needed.

In Cornerstone we had:

```js
cornerstone.disable(element);
// Triggers ELEMENT_DISABLED event
```


In Cornerstone-3D we have:

```js
renderingEngine.disableElement(element)
```

element disabled event will be fired for each canvas not retained.

OR

```js
renderingEngine.destroy()
```

if you plan to leave the page, this will destroy all elements.

The ELEMENT_DISABLED event contains just a reference to the canvas element which is now disabled, and related UIDs.

```js
eventDetail: {
  viewportUID,
  sceneUID,
  renderingEngineUID,
  canvas
}
```


### pageToPixel and pixelToCanvas

We are no longer rendering a single image at a time. In this framework, the viewport renders a specific plane in 3D space, determined by the camera parameters (e.g. focal point, frustum, clipping range). Data and annotations will be stored in 3D space ('world space', per frame of reference), and so in order to interact with, and render representations of annotations on the screen, you need to be able to convert between canvas space and world space.
It should be noted that, in order to share tools between Stack and Volume viewports, we also render StackViewports in 3D space. So basically,
they are 2D images positioned and oriented based on their metadata in space.


In Cornerstone we had:

```js
// Coordinate mapping functions
cornerstone.pageToPixel(element, pageX, pageY)
cornerstone.pixelToCanvas(element, { x, y });
```

In Cornerstone-3D we have:

```js
const canvasCoord = viewport.canvasToWorld([
  xCanvas,
  yCanvas
]);

const worldCoord = viewport.worldToCanvas([
  xWorld,
  yWorld,
  zWorld
]);
```


### getPixels
The getPixels approach is no longer valid in 3D, as you may be viewing the data at any (oblique) plane. Additionally, the viewport may be rendering a scene with more than one volume in it. The developer must now fetch the data array itself and use this data as necessary for their specific use case.

In Cornerstone we had:

```js
cornerstone.getPixels(element, x, y, width, height);
```

In Cornerstone-3D we have:

```js
const {
  dimensions: Point3
  direction: Float32Array
  spacing: Float32Array
  origin: Float32Array
  scalarData: Float32Array
  vtkImageData: vtkImageData
  metadata: { Modality: string }
  scaling?: Scaling
} = viewport.getImageData()
```

You can grab the vtkImageData to get pixel information

- `dimensions` - The x,y,z dimensions of the volume
- `spacing` - The x,y,z spacing of the volume
- `origin` - The x,y,z position of the center of the first voxel.
- `direction` - The row, column and normal direction cosines.
- `vtkImageData` - The underlying vtkImageData object (The tenderable object used in the underlying vtk.js rendering library).
- `scalarData` - This a single TypedArray (e.g. Float32Array) which contains all of the voxel values for the volume. Through the VTK API this could also be accessed using getScalars() from the vtkDataArray underlying the vtkImageData object.


### getImageLoadObject
Now that we have volumes, all the data is stored there, rather than in an image-specific cache.


In Cornerstone we had:

```js
cornerstone.cache.getImageLoadObject(imageId);
```

In Cornerstone-3D we have:

```js
const volume = cache.getVolume(volumeUID)

// Check which frames have already been loaded:
// - true if all frames have loaded.
const loaded = volume.loadStatus.loaded;

// An array of imageIdIndices that have been loaded (boolean array)
// cachedFrames is the same length as imageIds.
const cachedFrames = volume.loadStatus.cachedFrames
```
