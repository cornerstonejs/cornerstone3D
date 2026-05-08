import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  ctVoiRange,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_VIEWPORT';

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// State
let isVolumeViewport = false;

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack to Volume Conversion',
  'Demonstrates converting between Stack and Volume viewports with a reset button.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const viewportTypeInfo = document.createElement('div');
viewportTypeInfo.innerText = 'Viewport Type: Stack';
info.appendChild(viewportTypeInfo);

// Store imageIds globally
let imageIds: string[] = [];

// Reset Viewport button
addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the viewport
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      return;
    }

    viewport.resetProperties?.();

    viewport.resetCamera();
    viewport.render();
  },
});

// Convert to Volume button
const convertButton = addButtonToToolbar({
  title: 'Convert to Volume',
  onClick: async () => {
    if (isVolumeViewport) {
      return; // Already a volume viewport
    }

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Disable the current viewport
    renderingEngine.disableElement(viewportId);

    // Create a volume viewport
    const viewportInput = {
      viewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    };

    renderingEngine.enableElement(viewportInput);

    // Get the volume viewport that was created
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IVolumeViewport;

    // Create and load the volume
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();

    // Set the volume on the viewport
    await viewport.setVolumes([
      { volumeId, callback: setCtTransferFunctionForVolumeActor },
    ]);

    // Set the VOI range
    viewport.setProperties({ voiRange: ctVoiRange });

    // Render the image
    viewport.render();

    // Update state and UI
    isVolumeViewport = true;
    viewportTypeInfo.innerText = 'Viewport Type: Volume';

    // Gray out the convert button
    convertButton.disabled = true;
    convertButton.style.opacity = '0.5';
    convertButton.style.cursor = 'not-allowed';
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport initially
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IStackViewport;

  // Set the stack on the viewport
  viewport.setStack(imageIds);

  // Set the VOI of the stack
  viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
