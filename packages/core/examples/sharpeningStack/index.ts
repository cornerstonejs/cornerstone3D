import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addSliderToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const stackViewportId = 'CT_STACK';
const toolGroupId = 'myToolGroup';

// ======== Set up page ======== //
setTitleAndDescription(
  'Image Sharpening',
  'Demonstrates image sharpening using Laplacian edge enhancement for Stack Viewports.'
);

const content = document.getElementById('content');
const viewportsContainer = document.createElement('div');
viewportsContainer.style.display = 'flex';
viewportsContainer.style.flexDirection = 'row';
viewportsContainer.style.gap = '10px';

content.appendChild(viewportsContainer);

// Create stack viewport element
const stackElement = document.createElement('div');
stackElement.id = 'cornerstone-stack-element';
stackElement.style.width = '500px';
stackElement.style.height = '500px';

viewportsContainer.appendChild(stackElement);

// Add labels
const stackLabel = document.createElement('div');
stackLabel.innerText = 'Stack Viewport';
stackLabel.style.textAlign = 'center';
stackLabel.style.marginTop = '10px';
stackElement.appendChild(stackLabel);

const info = document.createElement('div');
content.appendChild(info);

const sharpeningInfo = document.createElement('div');
info.appendChild(sharpeningInfo);
sharpeningInfo.innerText = 'Sharpening: Disabled';

// Global sharpening state
let sharpeningEnabled = false;
let sharpeningIntensity = 0.5;

// Add sharpening controls
addButtonToToolbar({
  title: 'Toggle Sharpening',
  onClick: () => {
    sharpeningEnabled = !sharpeningEnabled;

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Update stack viewport
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        sharpening: {
          enabled: sharpeningEnabled,
          intensity: sharpeningIntensity,
        },
      });
      stackViewport.render();
    }

    sharpeningInfo.innerText = `Sharpening: ${sharpeningEnabled ? 'Enabled' : 'Disabled'} (Intensity: ${(sharpeningIntensity * 100).toFixed(0)}%)`;
  },
});

addSliderToToolbar({
  title: 'Sharpening Intensity',
  range: [0, 100],
  defaultValue: 50,
  onSelectedValueChange: (value) => {
    sharpeningIntensity = value / 100;

    if (!sharpeningEnabled) {
      return;
    }

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Update stack viewport
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        sharpening: {
          enabled: sharpeningEnabled,
          intensity: sharpeningIntensity,
        },
      });
      stackViewport.render();
    }

    sharpeningInfo.innerText = `Sharpening: ${sharpeningEnabled ? 'Enabled' : 'Disabled'} (Intensity: ${(sharpeningIntensity * 100).toFixed(0)}%)`;
  },
});

addButtonToToolbar({
  title: 'Reset',
  onClick: () => {
    sharpeningEnabled = false;
    sharpeningIntensity = 0.5;

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Reset stack viewport
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        sharpening: {
          enabled: false,
          intensity: 0.5,
        },
      });
      stackViewport.resetProperties();
      stackViewport.render();
    }

    sharpeningInfo.innerText = 'Sharpening: Disabled';
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Initialize cornerstone tools
  const { ToolGroupManager, StackScrollTool } = cornerstoneTools;

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(StackScrollTool);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: stackViewportId,
      type: ViewportType.STACK,
      element: stackElement,
      defaultOptions: {
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Get the stack viewport
  const stackViewport = renderingEngine.getViewport(
    stackViewportId
  ) as Types.IStackViewport;

  // Set the stack on the viewport
  await stackViewport.setStack(imageIds);

  // Set the VOI range
  stackViewport.setProperties({ voiRange: ctVoiRange });

  // Render the stack viewport
  stackViewport.render();

  // Create a tool group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add both viewports to the tool group
  toolGroup.addViewport(stackViewportId, renderingEngineId);

  // Add the StackScrollMouseWheelTool to the tool group
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the tool as active for mouse wheel interaction
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Wheel }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });
}

run();
