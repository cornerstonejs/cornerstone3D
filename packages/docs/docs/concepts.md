## Rendering

_index.html_

```html
<canvas class="target-canvas"></canvas>
```

_app.js_

```js
import {
  RenderingEngine, // class
  ORIENTATION, // constant
  ViewportType, // enum
} from 'vtkjs-viewport';

// RENDER
const renderingEngine = new RenderingEngine('ExampleRenderingEngineID');
const volumeId = 'VOLUME_ID ';
const viewports = [];
const viewport = {
  sceneUID,
  viewportId: 'viewportUID_0',
  type: ViewportType.ORTHOGRAPHIC,
  canvas: document.querySelector('.target-canvas'),
  defaultOptions: {
    orientation: Enums.OrientationAxis.AXIAL,
    background: [Math.random(), Math.random(), Math.random()],
  },
};

// Kick-off rendering
viewports.push(viewport);
renderingEngine.setViewports(viewports);

// Render backgrounds
renderingEngine.render();

// Create and load our image volume
// See: `./examples/helpers/getImageIdsAndCacheMetadata.js` for inspiration
const imageIds = [
  'wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/1',
  'wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/2',
  'wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/3',
];

imageCache.makeAndCacheImageVolume(imageIds, volumeId);
imageCache.loadVolume(volumeId, (event) => {
  if (event.framesProcessed === event.numFrames) {
    console.log('done loading!');
  }
});

// Tie scene to one or more image volumes
const scene = renderingEngine.getScene(sceneUID);

scene.setVolumes([
  {
    volumeId,
    callback: ({ volumeActor, volumeId }) => {
      // Where you might setup a transfer function or PET colormap
      console.log('volume loaded!');
    },
  },
]);

const viewport = scene.getViewport(viewports[0].viewportId);

// This will initialise volumes in GPU memory
renderingEngine.render();
```

For the most part, updating is as simple as using:

- `RenderingEngine.setViewports` and
- `Scene.setVolumes`

If you're using clientside routing and/or need to clean up resources more
aggressively, most constructs have a `.destroy` method. For example:

```js
renderingEngine.destroy();
```

## Tools

A tool is an uninstantiated class that implements at least the `BaseTool` interface.
Tools can be configured via their constructor. To use a tool, one must:
A tool is an uninstantiated class that implements at least the `BaseTool` interface.
Tools can be configured via their constructor. To use a tool, one must:
A tool is an uninstantiated class that implements at least the `BaseTool` interface.
Tools can be configured via their constructor. To use a tool, one must:
A tool is an uninstantiated class that implements at least the `BaseTool` interface.
Tools can be configured via their constructor. To use a tool, one must:

- Add the uninstantiated tool using the library's top level `addTool` function
- Add that same tool, by name, to a ToolGroup

The tool's behavior is then dependent on which rendering engines, scenes,
and viewports are associated with its Tool Group; as well as the tool's current
mode.

### Adding Tools

The @Tools library comes packaged with several common tools. All implement either
the `BaseTool` or `AnnotationTool`. Adding a tool makes it available to ToolGroups.
A high level `.removeTool` also exists.

```js
import * as csTools3d from '@cornerstonejs/tools';

// Add uninstantiated tool classes to the library
// These will be used to initialize tool instances when we explicitly add each
// tool to one or more tool groups
const { PanTool, StackScrollMouseWheelTool, ZoomTool, LengthTool } = csTools3d;

csTools3d.addTool(PanTool);
csTools3d.addTool(StackScrollMouseWheelTool);
csTools3d.addTool(ZoomTool);
csTools3d.addTool(LengthTool);
```

### Tool Group Manager

Tool Groups are a way to share tool configuration, state, and modes across
a set of `RengeringEngine`s, `Scene`s, and/or `Viewport`s. Tool Groups are managed
by a Tool Group Manager. Tool Group Managers are used to create, search for, and
destroy Tool Groups.

```js
import { ToolGroupManager } from '@cornerstonejs/tools';
import { ctVolumeId } from './constants';

const toolGroupId = 'TOOL_GROUP_ID';
const sceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);

// Add tools to ToolGroup
sceneToolGroup.addTool(PanTool.toolName);
sceneToolGroup.addTool(ZoomTool.toolName);
sceneToolGroup.addTool(StackScrollMouseWheelTool.toolName);
sceneToolGroup.addTool(LengthTool.toolName, {
  configuration: { volumeId: ctVolumeId },
});
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
sceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
sceneToolGroup.setToolActive(LengthTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Primary }],
});
sceneToolGroup.setToolActive(PanTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Auxiliary }],
});
sceneToolGroup.setToolActive(ZoomTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Secondary }],
});
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
import { Events as RENDERING_EVENTS } from 'vtkjs-viewport';
import { SynchronizerManager } from '@cornerstonejs/tools';

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
);

// Add viewports to synchronize
const firstViewport = { renderingEngineId, sceneUID, viewportId };
const secondViewport = {
  /* */
};

sync.add(firstViewport);
sync.add(secondViewport);
```

## Next steps

For next steps, you can:

- [Check out the Usage documentation](#)
- [Explore our example application's source code](#)
