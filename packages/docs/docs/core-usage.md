---
id: core-usage
---
# Usage

This page attempts to outline basic usage guidance. A more detailed, real-world
example exists in the `./packages/demo` directory of this repository. All guidance
here builds on the steps outlined on the "Setup" page.



## @Rendering


_index.html_

```html
<canvas class="target-canvas"></canvas>
```

_app.js_

```js
import {
  RenderingEngine, // class
  ORIENTATION, // constant
  VIEWPORT_TYPE, // enum
} from 'vtkjs-viewport'

// RENDER
const renderingEngine = new RenderingEngine('ExampleRenderingEngineID')
const volumeUID = 'VOLUME_UID'
const sceneUID = 'SCENE_UID'
const viewports = []
const viewport = {
  sceneUID,
  viewportUID: 'viewportUID_0',
  type: VIEWPORT_TYPE.ORTHOGRAPHIC,
  canvas: document.querySelector('.target-canvas'),
  defaultOptions: {
    orientation: ORIENTATION.AXIAL,
    background: [Math.random(), Math.random(), Math.random()],
  },
}

// Kick-off rendering
viewports.push(viewport)
renderingEngine.setViewports(viewports)

// Render backgrounds
renderingEngine.render()

// Create and load our image volume
// See: `./examples/helpers/getImageIdsAndCacheMetadata.js` for inspiration
const imageIds = [
  'csiv:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/1',
  'csiv:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/2',
  'csiv:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/3',
]

imageCache.makeAndCacheImageVolume(imageIds, volumeUID)
imageCache.loadVolume(volumeUID, (event) => {
  if (event.framesProcessed === event.numFrames) {
    console.log('done loading!')
  }
})

// Tie scene to one or more image volumes
const scene = renderingEngine.getScene(sceneUID)

scene.setVolumes([
  {
    volumeUID,
    callback: ({ volumeActor, volumeUID }) => {
      // Where you might setup a transfer function or PET colormap
      console.log('volume loaded!')
    },
  },
])

const viewport = scene.getViewport(viewports[0].viewportUID)

// This will initialise volumes in GPU memory
renderingEngine.render()
```

For the most part, updating is as simple as using:

- `RenderingEngine.setViewports` and
- `Scene.setVolumes`

If you're using clientside routing and/or need to clean up resources more
aggressively, most constructs have a `.destroy` method. For example:

```js
renderingEngine.destroy()
```

## @Tools

A tool is an uninstantiated class that implements at least the `BaseTool` interface.
Tools can be configured via their constructor. To use a tool, one must:

- Add the uninstantiated tool using the library's top level `addTool` function
- Add that same tool, by name, to a ToolGroup

The tool's behavior is then dependent on which rendering engines, scenes,
and viewports are associated with its Tool Group; as well as the tool's current
mode.

### Adding Tools

The @Tools library comes packaged with several common tools. All implement either
the `BaseTool` or `BaseAnnotationTool`. Adding a tool makes it available to ToolGroups.
A high level `.removeTool` also exists.

```js
import * as csTools3d from 'vtkjs-viewport-tools'

// Add uninstantiated tool classes to the library
// These will be used to initialize tool instances when we explicitly add each
// tool to one or more tool groups
const { PanTool, StackScrollMouseWheelTool, ZoomTool, LengthTool } = csTools3d

csTools3d.addTool(PanTool, {})
csTools3d.addTool(StackScrollMouseWheelTool, {})
csTools3d.addTool(ZoomTool, {})
csTools3d.addTool(LengthTool, {})
```

### Tool Group Manager

Tool Groups are a way to share tool configuration, state, and modes across
a set of `RengeringEngine`s, `Scene`s, and/or `Viewport`s. Tool Groups are managed
by a Tool Group Manager. Tool Group Managers are used to create, search for, and
destroy Tool Groups.

```js
import { ToolGroupManager } from 'vtkjs-viewport-tools'
import { ctVolumeUID } from './constants'

const toolGroupUID = 'TOOL_GROUP_UID'
const sceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UID)

// Add tools to ToolGroup
sceneToolGroup.addTool('Pan', {})
sceneToolGroup.addTool('Zoom', {})
sceneToolGroup.addTool('StackScrollMouseWheel', {})
sceneToolGroup.addTool('Length', {
  configuration: { volumeUID: ctVolumeUID },
})
```

### Tool Modes

Tools can be in one of four modes. Each mode impacts how the tool responds to
interactions. Those modes are:

<table>
  <tr>
    <td>Tool Mode</td>
    <td>Description</td>
  </tr>
  <tr>
    <td>Active</td>
    <td>
      <ul>
        <li>Tools with active bindings will respond to interactions</li>
        <li>If the tool is an annotation tool, click events not over existing annotations
  will create a new annotation.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td>Passive (default)</td>
    <td>
      <ul>
        <li>If the tool is an annotation tool, if it's handle or line is selected, it
    can be moved and repositioned.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td>Enabled</td>
    <td>
      <ul>
        <li>The tool will render, but cannot be interacted with.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td>Disabled</td>
    <td>
      <ul>
        <li>The tool will not render. No interaction is possible.</li>
      </ul>
    </td>
  </tr>
</table>

_NOTE:_

- There should never be two active tools with the same binding

```js
// Set the ToolGroup's ToolMode for each tool
// Possible modes include: 'Active', 'Passive', 'Enabled', 'Disabled'
sceneToolGroup.setToolActive('StackScrollMouseWheel')
sceneToolGroup.setToolActive('Length', {
  bindings: [ToolBindings.Mouse.Primary],
})
sceneToolGroup.setToolActive('Pan', {
  bindings: [ToolBindings.Mouse.Auxiliary],
})
sceneToolGroup.setToolActive('Zoom', {
  bindings: [ToolBindings.Mouse.Secondary],
})
```

### Synchronizers

The SynchronizerManager exposes similar API to that of the ToolGroupManager. A
created Synchronizer has methods like `addTarget`, `addSource`, `add` (which adds
the viewport as a "source" and a "target"), and equivelant `remove*` methods.

A synchronizer works by listening for a specified event to be raised on any `source`.
If detected, the callback function is called once for each `target`. The idea being
that changes to a `source` should be synchronized across `target`s.

Synchronizers will self-remove sources/targets if the viewport becomes disabled.
Synchronizers also expose a `disabled` flag that can be used to temporarily prevent
synchronization.

```js
import { EVENTS as RENDERING_EVENTS } from 'vtkjs-viewport'
import { SynchronizerManager } from 'vtkjs-viewport-tools'

const cameraPositionSyncrhonizer = SynchronizerManager.createSynchronizer(
  synchronizerName,
  RENDERING_EVENTS.CAMERA_MODIFIED,
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
const firstViewport = { renderingEngineUID, sceneUID, viewportUID }
const secondViewport = {
  /* */
}

sync.add(firstViewport)
sync.add(secondViewport)
```


## NEW

3x3+1 column Layout with the following hanging protocol

3x3

3 Rows: Axial, Sagittal, Coronal

3 Columns: CT, PET, Fusion

1 Column MIP for the PET image

PET is displayed Inverted in the PET and MIP Viewports


```js
/*
Assume an HTML page is present with nine <canvas/> elements in a 3x3 layout, and one column with another <canvas/> for the PET MIP.
These canvases are references as React Refs in this example, using notation such as 'containers.CT.AXIAL.current'.
*/

// Import the RenderingEngine, imageCache and some constants
import { CONSTANTS, imageCache, RenderingEngine } from '@vtk-viewport';
const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

// Define some IDs for referencing each viewport, scene, or volume later
const renderingEngineUID = 'PETCTRenderingEngine';
const ptVolumeUID = 'PET_VOLUME';
const ctVolumeUID = 'CT_VOLUME';
const SCENE_IDS = {
  CT: 'ctScene',
  PT: 'ptScene',
  FUSION: 'fusionScene',
  PTMIP: 'ptMipScene',
};
const VIEWPORT_IDS = {
  CT: {
    AXIAL: 'ctAxial',
    SAGITTAL: 'ctSagittal',
    CORONAL: 'ctCoronal',
  },
  PT: {
    AXIAL: 'ptAxial',
    SAGITTAL: 'ptSagittal',
    CORONAL: 'ptCoronal',
  },
  FUSION: {
    AXIAL: 'fusionAxial',
    SAGITTAL: 'fusionSagittal',
    CORONAL: 'fusionCoronal',
  },
  PTMIP: {
    CORONAL: 'ptMipCoronal',
  },
};

// Instantiate the RenderingEngine
const renderingEngine = new RenderingEngine(renderingEngineUID);

renderingEngine.setViewports([
  // CT
  {
    sceneUID: SCENE_IDS.CT,
    viewportUID: VIEWPORT_IDS.CT.AXIAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.CT.AXIAL.current,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
  }, {
    sceneUID: SCENE_IDS.CT,
    viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.CT.SAGITTAL.current,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
    },
  }, {
    sceneUID: SCENE_IDS.CT,
    viewportUID: VIEWPORT_IDS.CT.CORONAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.CT.CORONAL.current,
    defaultOptions: {
      orientation: ORIENTATION.CORONAL,
    },
  },
  // PT
  {
    sceneUID: SCENE_IDS.PT,
    viewportUID: VIEWPORT_IDS.PT.AXIAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.PT.AXIAL.current,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
      background: [1, 1, 1], // Set background to white because PET will be displayed inverted
    },
  }, {
    sceneUID: SCENE_IDS.PT,
    viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.PT.SAGITTAL.current,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
      background: [1, 1, 1],
    },
  }, {
    sceneUID: SCENE_IDS.PT,
    viewportUID: VIEWPORT_IDS.PT.CORONAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.PT.CORONAL.current,
    defaultOptions: {
      orientation: ORIENTATION.CORONAL,
      background: [1, 1, 1],
    },
  },
  // Fusion
  {
    sceneUID: SCENE_IDS.FUSION,
    viewportUID: VIEWPORT_IDS.FUSION.AXIAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.FUSION.AXIAL.current,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
    },
  }, {
    sceneUID: SCENE_IDS.FUSION,
    viewportUID: VIEWPORT_IDS.FUSION.SAGITTAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.FUSION.SAGITTAL.current,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
    },
  }, {
    sceneUID: SCENE_IDS.FUSION,
    viewportUID: VIEWPORT_IDS.FUSION.CORONAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.FUSION.CORONAL.current,
    defaultOptions: {
      orientation: ORIENTATION.CORONAL,
    },
  },
  // PET MIP
  {
    sceneUID: SCENE_IDS.PTMIP,
    viewportUID: VIEWPORT_IDS.PTMIP.CORONAL,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    canvas: containers.PTMIP.CORONAL.current,
    defaultOptions: {
      orientation: ORIENTATION.CORONAL,
      background: [1, 1, 1],
    },
  },
]);


/*
- Assume we have the DICOM Metadata from WADO-RS RetrieveMetadata at the Study or Series level already present in the application. These could be provided by any Cornerstone metadata provider.
- Assume we already know the Cornerstone imageIds for the PET and CT Series
*/

const { ptImageIds, ctImageIds } = imageIds;

// Create the Volumes for the PET and CT Series
const ptVolume = imageCache.makeAndCacheImageVolume(
  ptImageIds,
  ptVolumeUID
);
const ctVolume = imageCache.makeAndCacheImageVolume(
  ctImageIds,
  ctVolumeUID
);

// Define two functions to set up the actors for the PET volume inside the inverted PET scene and the Fusion scene
// These use VTK.js APIs to define and manipulate the color transfer functions for the volume actors.
function setPetInvertedTransferFunction({ volumeActor, volumeUID }) {
  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0);

  rgbTransferFunction.setRange(0, 5);

  const size = rgbTransferFunction.getSize();

  for (let index = 0; index < size; index++) {
    const nodeValue1 = [];

    rgbTransferFunction.getNodeValue(index, nodeValue1);

    nodeValue1[1] = 1 - nodeValue1[1];
    nodeValue1[2] = 1 - nodeValue1[2];
    nodeValue1[3] = 1 - nodeValue1[3];

    rgbTransferFunction.setNodeValue(index, nodeValue1);
  }
}

function setPetFusionColorMapTransferFunction({ volumeActor }) {
  const mapper = volumeActor.getMapper();
  mapper.setSampleDistance(1.0);

  const cfun = vtkColorTransferFunction.newInstance();
  const preset = vtkColorMaps.getPresetByName('hsv');
  cfun.applyColorMap(preset);
  cfun.setMappingRange(0, 5);

  volumeActor.getProperty().setRGBTransferFunction(0, cfun);

  // Create scalar opacity function
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0, 0.0);
  ofun.addPoint(0.1, 0.9);
  ofun.addPoint(5, 1.0);

  volumeActor.getProperty().setScalarOpacity(0, ofun);
}

// Retrieve the Scenes from the RenderingEngine instance
const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
const ptScene = renderingEngine.getScene(SCENE_IDS.PT);
const fusionScene = renderingEngine.getScene(SCENE_IDS.FUSION);
const ptMipScene = renderingEngine.getScene(SCENE_IDS.PTMIP);

// Set the Volumes for each Scene.
// - Assume there is a function for setting the CT Window/Level once the actor has been created
// - The PET transfer function examples are shown above.
// - Note that the Fusion Scene includes both the PET and CT volumes
ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);
ptScene.setVolumes([
  { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
]);
fusionScene.setVolumes([
  { volumeUID: ctVolumeUID, callback: setCTWWWC },
  { volumeUID: ptVolumeUID, callback: setPetColorMapTransferFunction },
]);
ptMipScene.setVolumes([
  { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
]);

// Initialize the rendering engine by calling a first render
// - This creates the buffers in the GPU, which is computationally expensive so it is best to get it out of the way while
//   the rest of the image data is loading.
renderingEngine.render();

// Initialize the loading of the PET volume.
imageCache.loadVolume(ptVolumeUID, event => {
  // Called whenever the volume data has changed.
  // Currently this happens when each slice has been downloaded, decoded, and inserted into the volume Array.
  // When it changes, re-render all Scenes displaying this volume.
  ptVolume.render();
});

// Similarly, initialize the loading of the CT volume.
imageCache.loadVolume(ctVolumeUID, event => {
  ctVolume.render();
});

// On page navigate, or unmount of the component, destory the RenderingEngine instance and decache the volumes
// - If you decache a volume while it is loading, any in-progress image data requests will be cancelled (if the image loader supports cancellation)
imageCache.decacheVolume(ctVolumeUID);
imageCache.decacheVolume(ptVolumeUID);
renderingEngine.destroy();
```

### Example screenshot

Note: MIP is not yet active in rightmost viewport, border lines are CSS in the example and not part of the framework.


```js
const stack = {
  currentImageIdIndex: 0,
  imageIds: ['imageId1', 'imageId2']
}

// Creating a canvas
const canvas = document.createElement('canvas')
canvas.style.width = `128px`
canvas.style.height = `128px`
document.body.appendChild(canvas)

// Creating a rendering Engine and UIDs
const renderingEngineUID = "myEngine"
const viewportUID = "myViewport"
const renderingEngine = new RenderingEngine(renderingEngineUID)

// Letting rendering Engine know about the canvases and viewport UIDs
renderingEngine.setViewports([
    {
      sceneUID: "", // No need for sceneUID for stacks
      viewportUID: viewportUID,
      type: "stack",
      canvas: canvas,
      defaultOptions: {
        background: [0, 0, 0], // Black background
      },
    },
  ])

// Setting the stack for the viewport
const viewport = renderingEngine.getViewport(viewportUID)


viewport.setStack(stack.imageIds, 0)
renderingEngine.render()
```
