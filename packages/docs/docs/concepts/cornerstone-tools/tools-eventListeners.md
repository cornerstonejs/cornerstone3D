---
id: tools-eventListeners
title: Events
---


## Event Listeners

The tools framework listens for “element enabled” events from the renderer. Event listeners are registered to each “enabled element”. Event listeners normalize native browser events, attach helpful data to each native event and trigger a custom event.

For example, a `cornerstonetoolsmouseclick` event is fired when a viewport is clicked. In this new version of the tool library, it will have an additional property (“renderer: ‘3D’”) attached to signify that it contains 3D information (i.e. world coordinates instead of image coordinates).

We intend to keep the same event names during migration so that it makes it easier for harmonizing the Cornerstone (legacy) and Cornerstone-3D together.
The library will otherwise emit the same events as the existing Cornerstone Tools, other than the following changes:


| Event name                       | Change  | Reason                                                                    |
|----------------------------------|---------|---------------------------------------------------------------------------|
| cornerstonetoolsstackscroll      | Removed | Stack scroll is replaced by a "camera updated" event.                     |
| cornerstonetools3Dcameraupdated  | Added   | Fired on a camera update. The event detail contains the camera information. |
| cornerstonetoolsclipstopped      | Removed | CINE functionality is not currently in scope                              |
| cornerstonetoolslabelmapmodified | Removed | Labelmaps (segmentations) are not currently in scope                      |


## Schema Changes


The following table demonstrates some expected schema changes for events. The key differences are that:

- Several UIDs will function as lookup keys for core API methods (renderingEngineId, sceneUID, viewportId, volumeId). This is similar to the “enabledElement” property currently provided in custom events, and can be used to obtain all of the imaging data that is being visualized.

- Snapshots of state at time of interaction return camera properties and coordinates in world space within the Scene's frame of reference.


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
    <td>N/A</td>
    <td>renderer: ‘3D’</td>
<td>
<div style={{height: "300px", overflow:"auto"}}>


A helper property to distinguish the renderer the event came from. Will be used in the future if other renderers are added to the framework (E.g. Cornerstone could be used in the same application for Ultrasound images, where volumes might not make sense).

</div>
</td>
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
  clippingRange,
  projectionMatrix,
  position,
  focalPoint,
  orthogonalOrPerspective,
  viewAngle
}
```
</div>
</td>
    <td>The viewport previously described the state in 2D, and we need additional information to uniquely define 3D views.
    Horizontal and vertical flipping is no longer a change to the view, but rather a transform applied to the volume actor itself in the scene. Note: This functionality has not been included in the current collaboration scope.</td>
  </tr>
  <tr>
<td>
<div style={{width: "300px"}}>


```js
Image: enabledElement.image

// This contained the entire displayed image object.
```
</div>
</td>
    <td>Using the SceneUID, the developer can retrieve all of the actors it contains.</td>
    <td>A single scene may have multiple volumes, and in the future additional data such as 3D surface models. <br></br>It is therefore easier to fetch the entire “viewport” object along with its scene from the renderer, and process this as needed in the tool.</td>
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
  CanvasCoord,
  WorldCoord
}
```
</div>
</td>
    <td>The canvas coordinates define where on the 2D canvas the event occurred. We also give the projected world coordinate (3D) at the plane defined by the focal point and the camera normal.</td>
  </tr>
</tbody>
</table>



## Event Dispatchers

Event Dispatchers will follow the same pattern as CornerstoneTools, in that there will be a centralized event dispatcher that decides whether a tool claims an event or not (necessary for supporting overlapping tools). Otherwise, the surface level API that the event dispatchers use to communicate with tools will be the same (e.g. tool.pointNearHandle and isPointNearTool). The implementations of these functions will need to take into account the 3D nature of the annotation though, and determining whether a tool is near the mouse cursor location will be left up to the tool implementation.
