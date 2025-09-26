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
const stackViewportId2 = 'CT_STACK_2';
const stackViewportId3 = 'CT_STACK_3';
const volumeViewportId = 'CT_VOLUME';
const toolGroupId = 'myToolGroup';

// ======== Set up page ======== //
setTitleAndDescription(
  'Image Smoothing',
  'Demonstrates image smoothing using Gaussian blur kernel for Stack & Volume Viewports.'
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
stackElement.style.width = '400px';
stackElement.style.height = '400px';

viewportsContainer.appendChild(stackElement);

// Create second stack viewport element
const stackElement2 = document.createElement('div');
stackElement2.id = 'cornerstone-stack-element-2';
stackElement2.style.width = '400px';
stackElement2.style.height = '400px';

viewportsContainer.appendChild(stackElement2);

// Create third stack viewport element
const stackElement3 = document.createElement('div');
stackElement3.id = 'cornerstone-stack-element-3';
stackElement3.style.width = '400px';
stackElement3.style.height = '400px';

viewportsContainer.appendChild(stackElement3);

// Create volume viewport element
const volumeElement = document.createElement('div');
volumeElement.id = 'cornerstone-volume-element';
volumeElement.style.width = '400px';
volumeElement.style.height = '400px';

viewportsContainer.appendChild(volumeElement);

// Disable right-click context menu on all viewport elements
[stackElement, stackElement2, stackElement3, volumeElement].forEach(
  (element) => {
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });
  }
);

// Add labels
const stackLabel = document.createElement('div');
stackLabel.innerText = 'Stack Viewport 1';
stackLabel.style.textAlign = 'center';
stackLabel.style.marginTop = '10px';
stackElement.appendChild(stackLabel);

const stackLabel2 = document.createElement('div');
stackLabel2.innerText = 'Stack Viewport 2';
stackLabel2.style.textAlign = 'center';
stackLabel2.style.marginTop = '10px';
stackElement2.appendChild(stackLabel2);

const stackLabel3 = document.createElement('div');
stackLabel3.innerText = 'Stack Viewport 3';
stackLabel3.style.textAlign = 'center';
stackLabel3.style.marginTop = '10px';
stackElement3.appendChild(stackLabel3);

const volumeLabel = document.createElement('div');
volumeLabel.innerText = 'Volume Viewport';
volumeLabel.style.textAlign = 'center';
volumeLabel.style.marginTop = '10px';
volumeElement.appendChild(volumeLabel);

const info = document.createElement('div');
content.appendChild(info);

const smoothingInfo = document.createElement('div');
info.appendChild(smoothingInfo);
smoothingInfo.innerText = 'Smoothing: 0%';

// Add interaction instructions
const instructionsContainer = document.createElement('div');
instructionsContainer.style.marginTop = '20px';
instructionsContainer.style.padding = '10px';
instructionsContainer.style.backgroundColor = '#f0f0f0';
instructionsContainer.style.borderRadius = '5px';
content.appendChild(instructionsContainer);

const instructionsTitle = document.createElement('h3');
instructionsTitle.innerText = 'Interaction Instructions:';
instructionsTitle.style.marginTop = '0';
instructionsContainer.appendChild(instructionsTitle);

const instructionsList = document.createElement('ul');
instructionsList.style.marginTop = '10px';
instructionsList.innerHTML = `
  <li><strong>Left Click + Drag:</strong> Stack Scroll (navigate through slices)</li>
  <li><strong>Right Click + Drag:</strong> Zoom In/Out</li>
  <li><strong>Middle Click + Drag:</strong> Pan (move the image)</li>
  <li><strong>Mouse Wheel:</strong> Stack Scroll (navigate through slices)</li>
  <li><strong>Smoothing Slider:</strong> Adjust image Smoothing (0 to -1000%)</li>
`;
instructionsContainer.appendChild(instructionsList);

// Add Smoothing slider with a unique ID so we can reference it later
addSliderToToolbar({
  id: 'smoothing-slider',
  title: 'Smoothing',
  range: [-1000, 0],
  defaultValue: 0,
  onSelectedValueChange: (value: number) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Update stack viewport 1
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        smoothing: value / 100, // Convert percentage to decimal
      });
      stackViewport.render();
    }

    // Update stack viewport 2
    const stackViewport2 = renderingEngine.getViewport(
      stackViewportId2
    ) as Types.IStackViewport;

    if (stackViewport2) {
      stackViewport2.setProperties({
        smoothing: value / 100, // Convert percentage to decimal
      });
      stackViewport2.render();
    }

    // Update stack viewport 3
    const stackViewport3 = renderingEngine.getViewport(
      stackViewportId3
    ) as Types.IStackViewport;

    if (stackViewport3) {
      stackViewport3.setProperties({
        smoothing: value / 100, // Convert percentage to decimal
      });
      stackViewport3.render();
    }

    // Update volume viewport
    const volumeViewport = renderingEngine.getViewport(
      volumeViewportId
    ) as Types.IVolumeViewport;

    if (volumeViewport) {
      volumeViewport.setProperties({
        smoothing: value / 100, // Convert percentage to decimal
      });
      volumeViewport.render();
    }

    smoothingInfo.innerText = `Smoothing: ${value}%`;
  },
});

addButtonToToolbar({
  title: 'Reset',
  onClick: () => {
    // Reset the slider value
    const slider = document.getElementById(
      'smoothing-slider'
    ) as HTMLInputElement;
    if (slider) {
      slider.value = '0';
    }

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Reset stack viewport 1
    const stackViewport = renderingEngine.getViewport(
      stackViewportId
    ) as Types.IStackViewport;

    if (stackViewport) {
      stackViewport.setProperties({
        smoothing: 0,
      });
      stackViewport.resetProperties();
      stackViewport.render();
    }

    // Reset stack viewport 2
    const stackViewport2 = renderingEngine.getViewport(
      stackViewportId2
    ) as Types.IStackViewport;

    if (stackViewport2) {
      stackViewport2.setProperties({
        smoothing: 0,
      });
      stackViewport2.resetProperties();
      stackViewport2.render();
    }

    // Reset stack viewport 3
    const stackViewport3 = renderingEngine.getViewport(
      stackViewportId3
    ) as Types.IStackViewport;

    if (stackViewport3) {
      stackViewport3.setProperties({
        smoothing: 0,
      });
      stackViewport3.resetProperties();
      stackViewport3.render();
    }

    // Reset volume viewport
    const volumeViewport = renderingEngine.getViewport(
      volumeViewportId
    ) as Types.IVolumeViewport;

    if (volumeViewport) {
      volumeViewport.setProperties({
        smoothing: 0,
      });
      volumeViewport.resetProperties();
      volumeViewport.render();
    }

    smoothingInfo.innerText = 'Smoothing: 0%';
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Initialize cornerstone tools
  const { ToolGroupManager, StackScrollTool, ZoomTool, PanTool } =
    cornerstoneTools;

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);

  // Get Cornerstone imageIds and fetch metadata into RAM for first series
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Get imageIds for second series
  const imageIds2 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.55651399101931177647030363790032',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.87075509829481869121008947712950',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Get imageIds for third series
  const imageIds3 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1.84416332615988066829602832830236187384',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1.73259459389408720224591489579010582581',
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
      viewportId: stackViewportId2,
      type: ViewportType.STACK,
      element: stackElement2,
      defaultOptions: {
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: stackViewportId3,
      type: ViewportType.STACK,
      element: stackElement3,
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

  // Get the second stack viewport
  const stackViewport2 = renderingEngine.getViewport(
    stackViewportId2
  ) as Types.IStackViewport;

  // Set the stack on the second viewport
  await stackViewport2.setStack(imageIds2);

  // Set the VOI range with custom window/level for this viewport
  stackViewport2.setProperties({
    voiRange: {
      lower: 2000 - 4100 / 2, // Level - Window/2
      upper: 2000 + 4100 / 2, // Level + Window/2
    },
  });

  // Render the second stack viewport
  stackViewport2.render();

  // Get the third stack viewport
  const stackViewport3 = renderingEngine.getViewport(
    stackViewportId3
  ) as Types.IStackViewport;

  // Set the stack on the third viewport
  await stackViewport3.setStack(imageIds3);

  // Set the VOI range with custom window/level for this viewport
  stackViewport3.setProperties({
    voiRange: {
      lower: 5393 - 1751 / 2, // Level - Window/2
      upper: 5393 + 1751 / 2, // Level + Window/2
    },
  });

  // Render the third stack viewport
  stackViewport3.render();

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

  // Add all viewports to the tool group
  toolGroup.addViewport(stackViewportId, renderingEngineId);
  toolGroup.addViewport(stackViewportId2, renderingEngineId);
  toolGroup.addViewport(stackViewportId3, renderingEngineId);
  toolGroup.addViewport(volumeViewportId, renderingEngineId);

  // Add all tools to the tool group
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);

  // Set up tool bindings
  // Left click (Primary) - Stack Scroll
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  // Right click (Secondary) - Zoom
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary }],
  });

  // Middle click (Auxiliary/Middle) - Pan
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary }],
  });

  // Mouse wheel - Stack Scroll
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Wheel }],
  });
}

run();
