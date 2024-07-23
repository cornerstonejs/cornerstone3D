---
id: legacy-to-3d
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migration Guides

As we are moving to the `Cornerstone3D` library, we are introducing a new set of APIs that are not backwards compatible with the old `Cornerstone` library. In this page, we will provide a migration guide for users who are already using the old `Cornerstone` library.

:::note Important
Please note that this is a work in progress and we are still working on completing the migration guides.
:::

### init

`Cornerstone` (legacy) didn't need to be initialized, but `CornerstoneTools` (legacy) should have been initialized.
In `Cornerstone3D` both core and tools should be initialized before using the libraries.

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
cornerstoneTools.init();
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
// detects gpu and decides whether to use gpu rendering or cpu fallback
cornerstone3D.init();
cornerstone3DTools.init();
```

</TabItem>
</Tabs>

### enabledElement

Enabled elements in `Cornerstone3D` don’t exist in isolation as in Cornerstone. When setting a layout, elements are tied to a rendering engine as output targets. When this happens they are considered “enabled”.

In `Cornerstone3D` we have two APIs for this:

- `setViewports`: enables a list of viewports at once
- `enableElement`: enables one viewport at a time

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
const element = document.getElementById('div-element');
cornerstone.enable(element);

// Triggers ELEMENT_ENABLED event
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
const element = document.getElementById("viewport-HTML-element");
const renderingEngine = new RenderingEngine();

// API1: set Viewports
renderingEngine.setViewports([
  {
    viewportId: "CTAxial",
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
    },
  },
]);

// API2: Enable Element
renderingEngine.enableElement({
  viewportId: "CTAxial",
  type: ViewportType.ORTHOGRAPHIC,
  element,
  defaultOptions: {
    orientation: Enums.OrientationAxis.AXIAL,
  },
});


// ELEMENT_ENABLED eventDetail includes:
{
  element,
  viewportId,
  renderingEngineId,
}
```

</TabItem>
</Tabs>

### loadAndCacheImage

In Cornerstone (legacy), you would load an image and cache it using the `loadAndCacheImage` API.
However, in `Cornerstone3D` you should use the viewports API to load and cache images.

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
cornerstone.loadAndCacheImage(imageId).then((image) => {
  // Do things, e.g. display an image
});
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
const viewport = renderingEngine.getViewport('CTViewport');

// one image in the stack
await viewport.setStack([imageId]);

// multiple imageIds
await viewport.setStack(
  [imageId1, imageId2],
  1 // frame 1
);
```

</TabItem>
</Tabs>

### displayImage

This is a bit different in that you now set the data per viewport rather than per element, as in Cornerstone.
When a viewport is later rendered, you are returned the viewport instance, which has helpers to access the HTML element, the renderer, etc.

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

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
  renderTimeInMs,
};
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js

// We gave the example for setting stack in the previous section on `loadAndCacheImage`,
// here we give example for the volume

// Define a set of imageIds as a volume.
const ctVolume = await cornerstone3D.volumeLoader.createAndCacheVolume(
  volumeId,
  { imageIds: volumeImageIds}
)

// Load the volume, the callback is called for each imageId
ctVolume.load(callback)

// Where eventDetail passed to the callback is (currently) of the form:

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

</TabItem>
</Tabs>

### updateImage

We have effectively the same approach right now, but we have three different helpers that can be called to render:

- All viewports associated with a rendering engine.
- A single viewport.

These are useful convenience helpers when using tools that may affect multiple viewports that all need to update (e.g. jump to a crosshair position on all three orthogonal MPR views).

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
cornerstone.updateImage(element, invalidated);
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
// Updates every viewport in the rendering engine.
renderingEngine.render()

// Update a single viewport
const myViewport = myScene.getViewport('myViewportId')
myViewport.render()

// on IMAGE_RENDERED event fired for all viewports:
eventDetail: {
  viewport,
}
```

</TabItem>
</Tabs>

### disable

The rendering engine controls when viewports are enabled/disabled, and will fire appropriate events as needed.

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
cornerstone.disable(element);
// Triggers ELEMENT_DISABLED event
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
renderingEngine.disableElement(element);

// element disabled event will be fired for each canvas not retained.

// OR

//this will destroy all elements.
renderingEngine.destroy();

// The ELEMENT_DISABLED event contains just a reference to the canvas element which is now disabled, and related IDs.

eventDetail: {
  viewportId, renderingEngineId, canvas;
}
```

</TabItem>
</Tabs>

### pageToPixel and pixelToCanvas

We are no longer rendering a single image at a time. In `Cornerstone3D`, the viewport renders a specific plane in 3D space, determined by the camera parameters (e.g. focal point, frustum, clipping range). Data and annotations will be stored in 3D space ('world space', per frame of reference), and so in order to interact with, and render representations of annotations on the screen, you need to be able to convert between canvas space and world space.
It should be noted that, in order to share tools between Stack and Volume viewports, we also render StackViewports in 3D space. So basically,
they are 2D images positioned and oriented based on their metadata in space.

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
// Coordinate mapping functions
cornerstone.pageToPixel(element, pageX, pageY);
cornerstone.pixelToCanvas(element, { x, y });
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
const canvasCoord = viewport.canvasToWorld([xCanvas, yCanvas]);
const worldCoord = viewport.worldToCanvas([xWorld, yWorld, zWorld]);
```

</TabItem>
</Tabs>

### getPixels

The `getPixels` approach is no longer valid in 3D, as you may be viewing the data at any (oblique) plane. Additionally, the viewport may be rendering a fusion with more than one volume (e.g., PET/CT) in it. The developer must now fetch the data array itself and use this data as necessary for their specific use case.

<Tabs>
<TabItem value="cornerstone" label="Cornerstone (legacy)">

```js
cornerstone.getPixels(element, x, y, width, height);
```

</TabItem>

<TabItem value="cornerstone3D" label="Cornerstone3D">

```js
const {
  dimensions,
  direction,
  spacing,
  origin,
  scalarData,
  imageData,
  metadata,
} = viewport.getImageData();

/**
 *
 * You can grab the vtkImageData to get pixel information
 *
 * - `dimensions` - The x,y,z dimensions of the volume
 * - `spacing` - The x,y,z spacing of the volume
 * - `origin` - The x,y,z position of the center of the first voxel.
 * - `direction` - The row, column and normal direction cosines.
 * - `imageData` - The underlying vtkImageData object (The tenderable object used in the underlying vtk.js rendering library).
 * - `scalarData` - This a single TypedArray (e.g. Float32Array) which contains all of the voxel values for the volume. Through the VTK AP this could also be accessed using getScalars() from the vtkDataArray underlying the vtkImageData object.
 *
 */
```

</TabItem>
</Tabs>

## events

The following table demonstrates some expected schema changes for events. The key differences are that:

- Several IDs will function as lookup keys for core API methods (renderingEngineId, viewportId, volumeId). This is similar to the `enabledElement` property currently provided in custom events, and can be used to obtain all of the imaging data that is being visualized.
- Snapshots of state at time of interaction return camera properties and coordinates in world space within the viewports's frame of reference.

<table style={{tableLayout:"fixed", display: "block", width: "100%"}}>
<thead>
  <tr>
    <th>CornerstoneTools</th>
    <th>CornerstoneTools3D</th>
    <th>Explanation for schema change</th>
  </tr>
</thead>
<tbody>
  <tr>
    <td>N/A</td>
    <td>renderingEngineId</td>
    <td>The Id of the rendering engine instance driving the viewport.</td>
  </tr>
  <tr>
    <td>N/A</td>
    <td>viewportId</td>
    <td>The Id of the viewport itself.</td>
  </tr>
  <tr>
<td>
<div style={{width: "300px"}}>

<!-- Don't change indentation for code in table -->

```js
viewport: {
  scale,
  translation: { x, y },
  voi: { windowWidth, windowCenter, windowWidth, windowCenter},
  invert,
  pixelReplication,
  rotation,
  hflip,
  vflip,
  modalityLUT,
  voiLUT,
  colormap,
  labelmap,
  displayedArea: {
    tlhc: { x, y },
    brhc: { x, y },
    rowPixelSpacing,
    columnPixelSpacing,
    presentationSizeMode: 'NONE'
  }
}
```

</div>
</td>
<td>
<div style={{width: "300px"}}>

```js
camera: {
  viewUp,
    viewPlaneNormal,
    position,
    focalPoint,
    orthogonalOrPerspective,
    viewAngle;
}
```

</div>
</td>
    <td>The viewport previously described the state in 2D, and we need additional information to uniquely define 3D views.
    Horizontal and vertical flipping is no longer a change to the view, but rather a transform applied to the volume actor itself in the scene.</td>
  </tr>
  <tr>
<td>
<div style={{width: "300px"}}>

```js
// Location in 2D within the image

startPoints / lastPoints / currentPoints / deltaPoints: {
    Page,
    Image,
    Client,
}
```

</div>
</td>
<td>
<div style={{width: "300px"}}>

```js
// Location in 3D in world space
{
  CanvasCoord, WorldCoord;
}
```

</div>
</td>
    <td>The canvas coordinates define where on the 2D canvas the event occurred. We also give the projected world coordinate (3D) at the plane defined by the focal point and the camera normal.</td>
  </tr>
</tbody>
</table>
