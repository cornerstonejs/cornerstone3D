import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  volumeLoader,
  Enums,
  utilities as csUtils,
} from '@cornerstonejs/core';
// TODO -> A load of the utilities in cornerstone tools are just about the volumes and should be in core instead
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetColorMapTransferFunctionForVolumeActor,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// Define unique ids for the volumes
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

// ======== Set up page ======== //
setTitleAndDescription(
  'Multi Volume CanvasToWorld',
  'Uses the canvasToWorld API to find the intensity value of each volume on mouse hover'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const mousePosDiv = document.createElement('div');

const canvasPosElement = document.createElement('p');
const worldPosElement = document.createElement('p');
const ctValueElement = document.createElement('p');
const ptValueElement = document.createElement('p');

canvasPosElement.innerText = 'canvas:';
worldPosElement.innerText = 'world:';
ctValueElement.innerText = 'CT value:';
ptValueElement.innerText = 'PT value:';

content.appendChild(mousePosDiv);

mousePosDiv.appendChild(canvasPosElement);
mousePosDiv.appendChild(worldPosElement);
mousePosDiv.appendChild(ctValueElement);
mousePosDiv.appendChild(ptValueElement);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'CT_SAGITTAL_STACK';
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IVolumeViewport;

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  // Set the volume to load
  await ctVolume.load();

  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Set the volume to load
  await ptVolume.load();

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor },
    {
      volumeId: ptVolumeId,
      callback: setPetColorMapTransferFunctionForVolumeActor,
    },
  ]);

  // Render the image
  viewport.render();

  function getValue(volume, worldPos) {
    const { dimensions, imageData } = volume;

    const index = imageData.worldToIndex(worldPos);

    index[0] = Math.floor(index[0]);
    index[1] = Math.floor(index[1]);
    index[2] = Math.floor(index[2]);

    if (!csUtils.indexWithinDimensions(index, dimensions)) {
      return;
    }

    const value = volume.voxelManager.getAtIJK(index[0], index[1], index[2]);

    return value;
  }

  element.addEventListener('mousemove', (evt) => {
    const rect = element.getBoundingClientRect();

    const canvasPos = [
      Math.floor(evt.clientX - rect.left),
      Math.floor(evt.clientY - rect.top),
    ] as Types.Point2;
    // Convert canvas coordiantes to world coordinates
    const worldPos = viewport.canvasToWorld(canvasPos);

    canvasPosElement.innerText = `canvas: (${canvasPos[0]}, ${canvasPos[1]})`;
    worldPosElement.innerText = `world: (${worldPos[0].toFixed(
      2
    )}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(2)})`;
    ctValueElement.innerText = `CT value: ${getValue(ctVolume, worldPos)}`;
    ptValueElement.innerText = `PT value: ${getValue(ptVolume, worldPos)}`;
  });
}

run();
