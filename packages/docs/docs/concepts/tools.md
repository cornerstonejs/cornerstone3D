---
id: tools
title: Tools & ToolGroups
---

## Introduction

Tools will be added in much the same way as in CornerstoneTools (legacy): `CornerstoneTools3D.addTool()`; They will then be enabled on viewports via `Tool Groups`. Tool Groups are a new concept meant to replace the “Global Tool Sync” feature in CornerstoneTools. A consumer of CornerstoneTools currently has two options when initializing the library:

- All viewports share tool configuration and tool modes OR
- All viewports must add, configure, and set modes for tools individually

The goal of tool groups is to support the above use cases, while also providing flexibility to coordinate tools across sets of viewports.



## Tool

A tool is an uninstantiated class that implements at least the `BaseTool` interface.
Tools can be configured via their constructor. To use a tool, one must:

- Add the uninstantiated tool using the library's top level `addTool` function
- Add that same tool, by name, to a `ToolGroup`

The tool's behavior is then dependent on which rendering engines, scenes,
and viewports are associated with its Tool Group; as well as the tool's current
mode.

### Adding Tools

The `Cornerstone3D-tools` library comes packaged with several common tools. All implement either
the `BaseTool` or `BaseAnnotationTool`. Adding a tool makes it available to ToolGroups.


```js
import * as csTools3d from '@ohif/cornerstone-tools'

// Add uninstantiated tool classes to the library
// These will be used to initialize tool instances when we explicitly add each
// tool to one or more tool groups
const { PanTool, ProbeTool, StackScrollMouseWheelTool, ZoomTool, LengthTool } = csTools3d

csTools3d.addTool(PanTool, {})
csTools3d.addTool(StackScrollMouseWheelTool, {})
csTools3d.addTool(ZoomTool, {})
csTools3d.addTool(LengthTool, {})
csTools3d.addTool(ProbeTool, {})
```

> Tools added above should also be added to the corresponding toolGroup.


### Tool Modes

Tools can be in one of four modes. Each mode impacts how the tool responds to
interactions.

> There should never be two active tools with the same binding


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


## ToolGroups

Tool Groups are a way to share tool configuration, state, and modes across
a set of `RengeringEngine`s, `Scene`s, and/or `Viewport`s.
For instance, assume you have a scene containing 3 viewports visualizing the same CT from 3 different angles (e.g., Axial, Sagittal, Coronal). Using toolGroups you can easily manipulate the same window level/width on all 3 viewports.

Tool Groups are managed
by a Tool Group Manager. Tool Group Managers are used to create, search for, and
destroy Tool Groups.

> Currently ToolGroups are not optional, and in order to use a tool you should create a toolGroup and add it to the toolGroup.

### Creating a ToolGroup
ToolGroupManager can be utilized to create a tool group using `createToolGroup`.

```js
import { ToolGroupManager } from 'vtkjs-viewport-tools'

const toolGroupUID = 'ctToolGroup'
const ctSceneToolGroup = ToolGroupManager.createToolGroup(toolGroupUID)

// Add tools to ToolGroup
// Manipulation tools
ctSceneToolGroup.addTool('Pan', {})
ctSceneToolGroup.addTool('Zoom', {})
ctSceneToolGroup.addTool('Probe', {})
```

#### Dynamic tool statistics
Cornerstone3D-Tools is capable of calculating dynamic statistics based on the modality of the volume being rendered. For instance, for CT volumes a `ProbeTool` will give Hounsfield Units and for PET it will calculate SUV stats.

In order to enable such dynamic tool statistics, you are required to provide the `volumeUID` when you are adding the tool.

```js
ctSceneToolGroup.addTool('Probe', {
  configuration: { volumeUID: ctVolumeUID },
})
```




### Activating a Tool
You can use `setToolActive` for each toolGroup to activate a tool providing a corresponding mouse key.


```js
// Set the ToolGroup's ToolMode for each tool
// Possible modes include: 'Active', 'Passive', 'Enabled', 'Disabled'
ctSceneToolGroup.setToolActive('StackScrollMouseWheel')
ctSceneToolGroup.setToolActive('Length', {
  bindings: [ToolBindings.Mouse.Primary],
})
ctSceneToolGroup.setToolActive('Pan', {
  bindings: [ToolBindings.Mouse.Auxiliary],
})
ctSceneToolGroup.setToolActive('Zoom', {
  bindings: [ToolBindings.Mouse.Secondary],
})
```


### Adding Viewports to ToolGroups
Finally, the toolGroup needs to get viewports that it should act on. You can use `addViewport` API in order to achieve this.



```js
// Apply tool group to viewport or all viewports rendering a scene
ctSceneToolGroup.addViewports(
  renderingEngineUID,
  sceneUID,
  viewportUID
)
```
