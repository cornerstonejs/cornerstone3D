---
id: synchronizers
title: Synchronizers
---


# Synchronizers

Synchronizers can be used to link particular actions across viewports (e.g. sync pan/zoom interaction), but they can also be used to tie any callback to a particular event. We expect these to be largely similar to their current state in CornerstoneTools. Synchronizers require:

- An event to listen for
- A function to call when that event is raised on a source viewport
- An array of source viewports
- An array of target viewports

The provided function receives the event, source viewports, and target viewports, and is often used to check “some value” on the source viewport. The function then updates the target viewports, often using public API exposed by the core library, to match that state/value.



## Usage

The SynchronizerManager exposes similar API to that of the ToolGroupManager. A
created Synchronizer has methods like `addTarget`, `addSource`, `add` (which adds
the viewport as a "source" and a "target"), and equivalent `remove*` methods.

Synchronizers will self-remove sources/targets if the viewport becomes disabled.
Synchronizers also expose a `disabled` flag that can be used to temporarily prevent
synchronization.


```js
import { Enums } from '@ohif/cornerstone-render'
import { SynchronizerManager } from '@ohif/cornerstone-tools'

const cameraPositionSyncrhonizer = SynchronizerManager.createSynchronizer(
  synchronizerName,
  Enums.Events.CAMERA_MODIFIED,
  (
    synchronizerInstance,
    sourceViewport,
    targetViewport,
    cameraModifiedEvent
  ) => {
    // Synchronization logic should go here
  }
)

// Add viewports to synchronize
const firstViewport = { renderingEngineUID, sceneUID, viewportId }
const secondViewport = {
  /* */
}

sync.add(firstViewport)
sync.add(secondViewport)
```

### Built-in Synchronizers
We have currently implemented two synchronizers that can be used right away,
#### Position Synchronizer
It synchronize the camera properties including the zoom, pan and scrolling between the viewports.

```js
const ctAxial = {
  sceneUID: SCENE_IDS.CT,
  viewportId: VIEWPORT_IDS.CT.AXIAL,
  type: ViewportType.ORTHOGRAPHIC,
  canvas: canvasContainers.get(0),
  defaultOptions: {
    orientation: ORIENTATION.AXIAL,
  },
}

const ptAxial = {
  sceneUID: SCENE_IDS.PT,
  viewportId: VIEWPORT_IDS.PT.AXIAL,
  type: ViewportType.ORTHOGRAPHIC,
  canvas: canvasContainers.get(3),
  defaultOptions: {
    orientation: ORIENTATION.AXIAL,
    background: [1, 1, 1],
  },
}

const axialSync = createCameraPositionSynchronizer('axialSync')

[ctAxial, ptAxial].forEach(vp => {
  const { renderingEngineUID, sceneUID, viewportId } = vp;
  axialSync.add({ renderingEngineUID, sceneUID, viewportId });
});

```

Internally, upon camera modified event on the source viewport, `cameraSyncCallback` runs to synchronize all the target viewports.


#### VOI Synchronizer
It synchronizes the VOI between the viewports. For instance, if in the 3x3 layout of PET/CT, the CT image contrast gets manipulated, we want the fusion viewports to reflect the change as well.

```js
const ctWLSync = createVOISynchronizer('ctWLSync')

ctViewports.forEach(viewport => {
  const { renderingEngineUID, sceneUID, viewportId } = viewport;
  ctWLSync.addSource({ renderingEngineUID, sceneUID, viewportId });
});

fusionViewports.forEach(viewport => {
  const { renderingEngineUID, sceneUID, viewportId } = viewport;
  ctWLSync.addTarget({ renderingEngineUID, sceneUID, viewportId });
});
```


Internally, `voiSyncCallback` runs after the VOI_MODIFIED event.
