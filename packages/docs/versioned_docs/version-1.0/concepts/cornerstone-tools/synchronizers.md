---
id: synchronizers
title: Synchronizers
---

# Synchronizers

Synchronizers can be used to link particular actions across viewports (e.g. sync pan/zoom interaction), but they can also be used to tie any callback to a particular event. Synchronizers require:

- An [`Event`](/api/core/namespace/Enums#Events) to listen for
- A function to call when that event is raised on a source viewport
- An array of `source` viewports
- An array of `target` viewports

The provided function receives the event, source viewports, and target viewports, and is often used to check “some value” on the source viewport. The function then updates the target viewports, often using public API exposed by the core library, to match that state/value.

## Usage

The `SynchronizerManager` exposes similar API to that of the `ToolGroupManager`. A
created Synchronizer has methods like `addTarget`, `addSource`, `add` (which adds
the viewport as a "source" and a "target"), and equivalent `remove*` methods.

Synchronizers will self-remove sources/targets if the viewport becomes disabled.
Synchronizers also expose a `disabled` flag that can be used to temporarily prevent
synchronization.

```js
import { Enums } from '@cornerstonejs/core';
import { SynchronizerManager } from '@cornerstonejs/tools';

const cameraPositionSynchronizer = SynchronizerManager.createSynchronizer(
  'synchronizerName',
  Enums.Events.CAMERA_MODIFIED,
  (
    synchronizerInstance,
    sourceViewport,
    targetViewport,
    cameraModifiedEvent
  ) => {
    // Synchronization logic should go here
  }
);

// Add viewports to synchronize
const firstViewport = { renderingEngineId, viewportId };
const secondViewport = {
  /* */
};

sync.addSource(firstViewport);
sync.addTarget(secondViewport);
```

### Built-in Synchronizers

We have currently implemented two synchronizers that can be used right away,

#### Position Synchronizer

It synchronize the camera properties including the zoom, pan and scrolling between the viewports.

```js
const ctAxial = {
  viewportId: VIEWPORT_IDS.CT.AXIAL,
  type: ViewportType.ORTHOGRAPHIC,
  element,
  defaultOptions: {
    orientation: Enums.OrientationAxis.AXIAL,
  },
};

const ptAxial = {
  viewportId: VIEWPORT_IDS.PT.AXIAL,
  type: ViewportType.ORTHOGRAPHIC,
  element,
  defaultOptions: {
    orientation: Enums.OrientationAxis.AXIAL,
    background: [1, 1, 1],
  },
};

const axialSync = createCameraPositionSynchronizer('axialSync')[
  (ctAxial, ptAxial)
].forEach((vp) => {
  const { renderingEngineId, viewportId } = vp;
  axialSync.add({ renderingEngineId, viewportId });
});
```

Internally, upon camera modified event on the source viewport, `cameraSyncCallback` runs to synchronize all the target viewports.

#### VOI Synchronizer

It synchronizes the VOI between the viewports. For instance, if in the 3x3 layout of PET/CT, the CT image contrast gets manipulated, we want the fusion viewports to reflect the change as well.

```js
const ctWLSync = createVOISynchronizer('ctWLSync');

ctViewports.forEach((viewport) => {
  const { renderingEngineId, viewportId } = viewport;
  ctWLSync.addSource({ renderingEngineId, viewportId });
});

fusionViewports.forEach((viewport) => {
  const { renderingEngineId, viewportId } = viewport;
  ctWLSync.addTarget({ renderingEngineId, viewportId });
});
```

Internally, `voiSyncCallback` runs after the `VOI_MODIFIED` event.
