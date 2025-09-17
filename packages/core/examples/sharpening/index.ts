import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addSliderToToolbar,
  ctVoiRange,
  setCtTransferFunctionForVolumeActor,
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
const volumeViewportId = 'CT_VOLUME';
const toolGroupId = 'myToolGroup';

// ======== Set up page ======== //
setTitleAndDescription(
  'Image Sharpening',
  'Demonstrates image sharpening using Laplacian edge enhancement for Stack & Volume Viewports.'
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

// Create volume viewport element
const volumeElement = document.createElement('div');
volumeElement.id = 'cornerstone-volume-element';
volumeElement.style.width = '500px';
volumeElement.style.height = '500px';

viewportsContainer.appendChild(volumeElement);

// Add labels
const stackLabel = document.createElement('div');
stackLabel.innerText = 'Stack Viewport';
stackLabel.style.textAlign = 'center';
stackLabel.style.marginTop = '10px';
stackElement.appendChild(stackLabel);

const volumeLabel = document.createElement('div');
volumeLabel.innerText = 'Volume Viewport';
volumeLabel.style.textAlign = 'center';
volumeLabel.style.marginTop = '10px';
volumeElement.appendChild(volumeLabel);

const info = document.createElement('div');
content.appendChild(info);

const sharpeningInfo = document.createElement('div');
info.appendChild(sharpeningInfo);
sharpeningInfo.innerText = 'Sharpening: 0%';

// Add sharpening slider with a unique ID so we can reference it later
addSliderToToolbar({
  id: 'sharpening-slider',
  title: 'Sharpening',
  range: [0, 300],
  defaultValue: 0,
  onSelectedValueChange: (value: number) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Update stack viewport
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        sharpening: value / 100, // Convert percentage to decimal
      });
      stackViewport.render();
    }

    // Update volume viewport
    const volumeViewport = renderingEngine.getViewport(
      volumeViewportId
    ) as Types.IVolumeViewport;

    if (volumeViewport) {
      volumeViewport.setProperties({
        sharpening: value / 100, // Convert percentage to decimal
      });
      volumeViewport.render();
    }

    sharpeningInfo.innerText = `Sharpening: ${value}%`;
  },
});

addButtonToToolbar({
  title: 'Reset',
  onClick: () => {
    // Reset the slider value
    const slider = document.getElementById(
      'sharpening-slider'
    ) as HTMLInputElement;
    if (slider) {
      slider.value = '0';
    }

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Reset stack viewport
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        sharpening: 0,
      });
      stackViewport.resetProperties();
      stackViewport.render();
    }

    // Reset volume viewport
    const volumeViewport = renderingEngine.getViewport(
      volumeViewportId
    ) as Types.IVolumeViewport;

    if (volumeViewport) {
      volumeViewport.setProperties({
        sharpening: 0,
      });
      volumeViewport.resetProperties();
      volumeViewport.render();
    }

    sharpeningInfo.innerText = 'Sharpening: 0%';
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
    {
      viewportId: volumeViewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element: volumeElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
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

  // Get the volume viewport
  const volumeViewport = renderingEngine.getViewport(
    volumeViewportId
  ) as Types.IVolumeViewport;

  // Define a unique id for the volume
  const volumeName = 'CT_VOLUME_ID';
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
  const volumeId = `${volumeLoaderScheme}:${volumeName}`;

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  // Render the volume viewport
  volumeViewport.render();

  // Create a tool group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add both viewports to the tool group
  toolGroup.addViewport(stackViewportId, renderingEngineId);
  toolGroup.addViewport(volumeViewportId, renderingEngineId);

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
