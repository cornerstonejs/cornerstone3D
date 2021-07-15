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

In Cornerstone-3D:

```js
const canvas = document.getElementById('canvas-element');
const renderingEngine = new RenderingEngine();

// For Constants, see Example below
renderingEngine.setViewports([
 {
    sceneUID: "CT",
    viewportUID: "CTAxial",
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
 }
]);

// setViewports triggers events on the Canvas
renderingEngine.events.addEventListener(...)

ELEMENT_ENABLED eventData includes:
{
  canvas,
  sceneUID,
  viewportUID,
  renderingEngineUID,
}
```

### loadAndCacheImage


First, a volume is defined (similar to “stacks” in Cornerstone), and memory for this volume is allocated, then the user can trigger a load to fetch the data.

As the data corresponding to each imageId is fetched and decoded, the volume is filled up with data, the callback is called as each frame returns, and the eventData given to the callback is shown in the example.

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

// no callback, one image in the stack
await viewport.setStack(
  [imageId],
)

// with callback, muliple imageIds
await viewport.setStack(
  [imageId1, imageId2],
  1, // frame 1
  [callback1, callback2] // callbacks
)
```



In Cornerstone-3D for loading volumes we have

```js
// Define a set of imageIds as a volume.
const ctVolume = await createAndCacheVolume(
  volumeUID,
  { imageIds: volumeImageIds}
)

// Load the volume, the callback is called for each imageId
ctVolume.load(callback)
```

Where eventData passed to the callback is (currently) of the form:

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
// with eventData as follows
const eventData = {
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
eventData: {
  viewport,
}
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
eventData: {
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
renderingEngine.setViewports()
```

to reset the layout, which may remove viewports. an element disabled event will be fired for each canvas not retained.

OR

```js
renderingEngine.destroy()
```

if you plan to leave the page, this will destroy all elements.

The ELEMENT_DISABLED event contains just a reference to the canvas element which is now disabled, and related UIDs.

```js
eventData: {
  viewportUID,
  sceneUID,
  renderingEngineUID,
  canvas
}
```


### pageToPixel and pixelToCanvas
We are no longer rendering a single image at a time. In this framework, the viewport is rendering a specific plane in 3D space, determined by the camera parameters (e.g. focal point, frustum, clipping range). Data and annotations will be stored in 3D space ('world space', per frame of reference), and so in order to interact with, and render representations of annotations to the screen, you need to be able to convert between canvas space and world space.

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
const volume = imageCache.getImageVolume(volumeUID)
```

The volume then has the following properties:

- uid - The volume’s UID
- metadata - The volume’s DICOM metadata
- dimensions - The x,y,z dimensions of the volume
- spacing - The x,y,z spacing of the volume
- origin - The x,y,z position of the center of the first voxel.
- direction - The row, column and normal direction cosines.
- vtkImageData - The underlying vtkImageData object (The renderable object used in the underlying vtk.js rendering library).
- scalarData - This a single TypedArray (e.g. Float32Array) which contains all of the voxel values for the volume. Through the VTK API this could also be accessed using getScalars() from the vtkDataArray underlying the vtkImageData object.
- volumeMapper - The vtkVolumeMapper, a rendering mapper referencing GPU texture memory for the object. referenced when adding the volume to a scene.

The metadata has the following properties, which are the DICOM tags associated with the volume’s position and its data representation:

```js
  metadata: {
    BitsAllocated,
    BitsStored,
    SamplesPerPixel,
    HighBit,
    PhotometricInterpretation,
    PixelRepresentation,
    Modality,
    ImageOrientationPatient,
    PixelSpacing,
    FrameOfReferenceUID,
    Columns,
    Rows,
    voiLut,
  };
```

If the volume was created by imageIds you have these two additional properties:

```js
imageIds - An array of per-frame imageIds
loadStatus: {
  loaded // Boolean: Whether or not the entire volume has loaded.
  cachedFrames: // A Boolean array of same length of as the imageIds, which states if they have been loaded.
}
```


### getImageLoadObject
Now that we have volumes, all the data is stored there, rather than in an image-specific cache.


In Cornerstone we had:

```js
cornerstone.imageCache.getImageLoadObject(imageId);
```

In Cornerstone-3D we have:

```js
const volume = imageCache.getImageVolume(volumeUID)

// Add a callback for when each image is rendered (also starts loading volume if loadVolume has not already been called):
imageCache.loadVolume(volumeUID, callback);

// Check which frames have already been loaded:
// - true if all frames have loaded.
const loaded = volume.loadStatus.loaded;

// An array of imageIdIndices that have been loaded (boolean array)
// cachedFrames is the same length as imageIds.
const cachedFrames = volume.loadStatus.cachedFrames
```
