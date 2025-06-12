---
id: basic-manipulation-tool
title: Manipulation Tools
summary: Tutorial on implementing manipulation tools like zoom and window level for interacting with medical images in Cornerstone3D
---

# Manipulation Tools

In this tutorial, you will learn how to add a zoom manipulation tool.

## Preface

In order to render a volume we need:

- init the libraries
- A HTMLDivElement to render the viewport
- The path to the images (`imageId`s).

## Implementation

**Initialize cornerstone and related libraries**

```js
import { init as coreInit } from '@cornerstonejs/core';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import { init as cornerstoneToolsInit } from '@cornerstonejs/tools';

await coreInit();
await dicomImageLoaderInit();
await cornerstoneToolsInit();
```

We have already stored images on a server for the purpose of this tutorial.

First let's create a HTMLDivElements and style it.

```js
const content = document.getElementById('content');

const element = document.createElement('div');

// Disable the default context menu
element.oncontextmenu = (e) => e.preventDefault();
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
```

Next, we need a `renderingEngine`

```js
const renderingEngineId = 'myRenderingEngine';
const renderingEngine = new RenderingEngine(renderingEngineId);
```

We can use a StackViewport for this example.

```js
const viewportId = 'CT_AXIAL_STACK';

const viewportInput = {
  viewportId,
  element,
  type: ViewportType.STACK,
};

renderingEngine.enableElement(viewportInput);
```

RenderingEngine will handle creation of the viewports, and we can get the viewport object and set the images on it.

```js
const viewport = renderingEngine.getViewport(viewportId);

viewport.setStack(imageIds);

viewport.render();
```

In order for us to use manipulation tools, add them inside `Cornerstone3DTools` internal state via the `addTool` API.

```js
addTool(ZoomTool);
addTool(WindowLevelTool);
```

Next, create a ToolGroup and add the tools we want to use.
ToolGroups makes it possible to share tools between multiple viewports, so we also need to let the ToolGroup know which viewports it should act on.

```js
const toolGroupId = 'myToolGroup';
const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

toolGroup.addTool(ZoomTool.toolName);
toolGroup.addTool(WindowLevelTool.toolName);

toolGroup.addViewport(viewportId, renderingEngineId);
```

:::note Tip

Why do add renderingEngineUID to the ToolGroup? Because viewportId is unique within each renderingEngine.

:::

Next, set the Tool to be active, which means we also need to define a bindings for the tool (which mouse button makes it active).

```js
// Set the windowLevel tool to be active when the mouse left button is pressed
toolGroup.setToolActive(WindowLevelTool.toolName, {
  bindings: [
    {
      mouseButton: csToolsEnums.MouseBindings.Primary, // Left Click
    },
  ],
});

toolGroup.setToolActive(ZoomTool.toolName, {
  bindings: [
    {
      mouseButton: csToolsEnums.MouseBindings.Secondary, // Right Click
    },
  ],
});
```

## Final Code

<details>
<summary>Final Code</summary>

```js
import { init as coreInit, RenderingEngine, Enums } from '@cornerstonejs/core';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  Enums as csToolsEnums,
  addTool,
} from '@cornerstonejs/tools';
import { createImageIdsAndCacheMetaData } from '../../../../utils/demo/helpers';

const { ViewportType } = Enums;

const content = document.getElementById('content');

const element = document.createElement('div');

// Disable the default context menu
element.oncontextmenu = (e) => e.preventDefault();
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  await coreInit();
  await dicomImageLoaderInit();
  await cornerstoneToolsInit();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportId = 'CT_AXIAL_STACK';

  const viewportInput = {
    viewportId,
    element,
    type: ViewportType.STACK,
  };

  renderingEngine.enableElement(viewportInput);

  const viewport = renderingEngine.getViewport(viewportId);

  viewport.setStack(imageIds);

  viewport.render();

  const toolGroupId = 'myToolGroup';
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addTool(ZoomTool);
  addTool(WindowLevelTool);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);

  toolGroup.addViewport(viewportId);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: csToolsEnums.MouseBindings.Primary, // Left Click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: csToolsEnums.MouseBindings.Secondary, // Right Click
      },
    ],
  });
  viewport.render();
}

run();
```

</details>

![](../assets/basic-manipulation-tool.png)

## Read more

Learn more about:

- [ToolGroup](../concepts/cornerstone-tools/toolGroups.md)
- [Tools](../concepts/cornerstone-tools/tools.md)
