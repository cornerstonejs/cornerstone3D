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
  ctVoiRange,
  addButtonToToolbar,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { segmentation } = cornerstoneTools;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

// Define unique ids for the volumes
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

// Segmentation ID
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription('Stack Viewport First then Add Overlay Volume', '');

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
let viewport: Types.IViewport;
let renderingEngine: RenderingEngine;
let ctImageIds, ptImageIds;
addButtonToToolbar({
  title: 'Stack to Volume',
  onClick: () => {
    const viewPresentation = viewport.getViewPresentation();
    const viewReference = viewport.getViewReference();

    convertStackToFusionVolume();
    viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

    // for some reason we need the setTimeout here since the viewReference requires
    // image data
    setTimeout(() => {
      viewport.setViewReference(viewReference);
      viewport.setViewPresentation(viewPresentation);
      viewport.render();
    }, 100);
  },
});

addButtonToToolbar({
  title: 'Stack to Volume with Labelmap',
  onClick: () => {
    const viewPresentation = viewport.getViewPresentation();
    const viewReference = viewport.getViewReference();

    convertStackToVolumeWithLabelmap();
    viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

    setTimeout(() => {
      viewport.setViewReference(viewReference);
      viewport.render();
    }, 100);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
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
  viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;

  // Set the stack on the viewport
  await viewport.setStack(ctImageIds);

  // Create and cache both volumes
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Load the volumes
  await ctVolume.load();
  await ptVolume.load();

  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(ctVolumeId, {
    volumeId: segmentationId,
  });

  // Render the image
  viewport.render();
  viewport.setZoom(2.4);
  viewport.setPan([-100, -100]);
}

/**
 * Converts stack viewport to volume viewport with fusion
 */
async function convertStackToFusionVolume() {
  // Disable the current viewport
  const renderingEngine = getRenderingEngine(renderingEngineId);
  renderingEngine.disableElement(viewportId);

  // Create new volume viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
      background: [0.5, 0.7, 0.5] as Types.Point3,
    },
  };

  // Enable the volume viewport
  renderingEngine.enableElement(viewportInput);

  viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

  // Set both volumes on the viewport with fusion
  viewport.setVolumes([
    {
      volumeId: ctVolumeId,
      callback: setCtTransferFunctionForVolumeActor,
    },
    {
      volumeId: ptVolumeId,
      callback: setPetColorMapTransferFunctionForVolumeActor,
    },
  ]);
}

/**
 * Converts stack viewport to volume viewport with a labelmap for segmentation
 */
async function convertStackToVolumeWithLabelmap() {
  // Disable the current viewport
  const renderingEngine = getRenderingEngine(renderingEngineId);
  renderingEngine.disableElement(viewportId);

  // Create new volume viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
      background: [0.2, 0.7, 0.2] as Types.Point3,
    },
  };

  // Enable the volume viewport
  renderingEngine.enableElement(viewportInput);

  viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

  // Add the segmentation to state
  await segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  // Set the volume on the viewport
  viewport.setVolumes([
    {
      volumeId: ctVolumeId,
      callback: setCtTransferFunctionForVolumeActor,
    },
  ]);

  // Add the segmentation representation to the viewport
  const segmentationRepresentation = {
    segmentationId,
    type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
  };

  await segmentation.addLabelmapRepresentationToViewport(viewportId, [
    segmentationRepresentation,
  ]);
}

run();
