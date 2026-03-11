import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  PlanarViewportV2,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  camera as cameraHelpers,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const dataId = 'ct-stack-api';

function isCpuForced(): boolean {
  return new URLSearchParams(window.location.search).get('cpu') === 'true';
}

function syncExampleUrl(): void {
  const nextUrl = new URL(window.location.href);
  const forceCpu = isCpuForced();

  if (forceCpu) {
    nextUrl.searchParams.set('cpu', 'true');
  } else {
    nextUrl.searchParams.delete('cpu');
  }

  window.history.replaceState({}, '', nextUrl);
}

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack API On PlanarViewportV2',
  'Demonstrates stack-like interaction using PlanarViewportV2. Add ?cpu=true to force the CPU image path.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const renderModeInfo = document.createElement('div');
info.appendChild(renderModeInfo);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

function updateViewportInfo(): void {
  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (!renderingEngine) {
    return;
  }

  const viewport = renderingEngine.getViewport(viewportId) as PlanarViewportV2;

  if (!viewport) {
    return;
  }

  renderModeInfo.innerText = `Render Mode: ${
    viewport.getDataRenderMode(dataId) ?? 'unknown'
  }`;

  const { rotation } = viewport.getViewPresentation();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
}

element.addEventListener(Events.CAMERA_MODIFIED, updateViewportInfo);

addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as PlanarViewportV2;

    // Set a range to highlight bones
    viewport.setDataPresentation(dataId, {
      voiRange: { upper: 2500, lower: -1500 },
    });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Next Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as PlanarViewportV2;

    // Get the current index of the image displayed
    const currentImageIdIndex = viewport.getCurrentImageIdIndex();

    // Increment the index, clamping to the last image if necessary
    const numImages = viewport.getImageIds().length;
    let newImageIdIndex = currentImageIdIndex + 1;

    newImageIdIndex = Math.min(newImageIdIndex, numImages - 1);

    // Set the new image index, the viewport itself does a re-render
    viewport.setImageIdIndex(newImageIdIndex);
  },
});

addButtonToToolbar({
  title: 'Previous Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as PlanarViewportV2;

    // Get the current index of the image displayed
    const currentImageIdIndex = viewport.getCurrentImageIdIndex();

    // Increment the index, clamping to the first image if necessary
    let newImageIdIndex = currentImageIdIndex - 1;

    newImageIdIndex = Math.max(newImageIdIndex, 0);

    // Set the new image index, the viewport itself does a re-render
    viewport.setImageIdIndex(newImageIdIndex);
  },
});

addButtonToToolbar({
  title: 'Rotate Random',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(viewportId);

    const rotation = Math.random() * 360;

    viewport.setViewPresentation({ rotation });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Absolute 150',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(viewportId);

    viewport.setViewPresentation({ rotation: 150 });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Delta 30',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(viewportId);

    const { rotation } = viewport.getViewPresentation();
    viewport.setViewPresentation({ rotation: rotation + 30 });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as PlanarViewportV2;

    const currentPresentation = viewport.getDataPresentation(dataId);

    viewport.setDataPresentation(dataId, {
      invert: !(currentPresentation?.invert ?? false),
    });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as PlanarViewportV2;

    // Reset the camera so that we can set some pan and zoom relative to the
    // defaults for this demo. Note that changes could be relative instead.
    viewport.resetCamera();

    // Get the current camera properties
    const camera = viewport.getCamera();

    const { parallelScale, position, focalPoint } =
      cameraHelpers.getRandomlyTranslatedAndZoomedCameraProperties(camera, 50);

    const newCamera = {
      parallelScale,
      position: position as Types.Point3,
      focalPoint: focalPoint as Types.Point3,
    };

    viewport.setCamera(newCamera);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the planar viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as PlanarViewportV2;

    viewport.resetCamera();
    viewport.setDataPresentation(dataId, {
      invert: false,
      opacity: 1,
      visible: true,
      voiRange: ctVoiRange,
    });
    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  syncExampleUrl();

  // Init Cornerstone and related libraries
  await initDemo();

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

  const viewportInput = {
    viewportId,
    type: ViewportType.PLANAR_V2,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the planar viewport that was created
  const viewport = renderingEngine.getViewport(viewportId) as PlanarViewportV2;

  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  utilities.viewportV2DataSetMetadataProvider.add(dataId, {
    imageIds: stack,
  });
  await viewport.setDataIds([dataId], {
    orientation: Enums.OrientationAxis.ACQUISITION,
    renderMode: isCpuForced() ? 'cpu2d' : 'auto',
  });
  viewport.setDataPresentation(dataId, { voiRange: ctVoiRange });
  updateViewportInfo();

  viewport.render();
}

run();
