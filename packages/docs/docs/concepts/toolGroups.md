---
id: toolGroups
title: Tool Groups
---


# ToolGroups

Tools will be added in much the same way as in CornerstoneTools: CornerstoneTools3D.addTool(); They will then be enabled on viewports via Tool Groups. Tool Groups are a new concept meant to replace the “Global Tool Sync” feature in CornerstoneTools. A consumer of CornerstoneTools currently has two options when initializing the library:

All viewports share tool configuration and tool modes

All viewports must add, configure, and set modes for tools individually

The goal of tool groups is to support the above use cases, while also providing flexibility to coordinate tools across sets of viewports. Here is some example code of what this might look like:


```js
const ctToolGroup = ToolGroupManager.createGroup('ct-viewports');

// Manually build state
ctToolGroup.setToolActive('length', { bindings: [BINDINGS.MOUSE_LEFT] });
ctToolGroup.setToolActive('pan', { bindings: [BINDINGS.MOUSE_MIDDLE] });
ctToolGroup.setToolActive('zoom', { bindings: [BINDINGS.MOUSE_RIGHT] });

// Get / Set state (serializable config)
const ctToolGroupState = ctToolGroup.getState();

// Disable the length tool on left click
delete ctToolGroupState['length'];
ctToolGroup.setState(ctToolGroupState);

// Apply tool group to viewport or all viewports rendering a scene
ctToolGroup.addViewport(renderingEngineUID, sceneUID, viewportUID)
ctToolGroup.addScene(renderingEngineUID, sceneUID)

// Find tool groups attached to a viewport
const toolGroupsArray = ToolGroupManager.findGroupsForViewport(viewportUID)
```
