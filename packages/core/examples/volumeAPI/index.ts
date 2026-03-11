import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  getRenderingEngine,
  PlanarViewportV2,
  RenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  camera as cameraHelpers,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

type PlanarVolumeOrientation =
  | Enums.OrientationAxis.AXIAL
  | Enums.OrientationAxis.CORONAL
  | Enums.OrientationAxis.SAGITTAL;

const orientations = [
  Enums.OrientationAxis.AXIAL,
  Enums.OrientationAxis.CORONAL,
  Enums.OrientationAxis.SAGITTAL,
] as const;
const { Events, ViewportType } = Enums;

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_PLANAR';
const dataId = 'ct-volume-api';
const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const defaultVoiRange = { lower: -160, upper: 240 };
const highlightedBoneVoiRange = { lower: -1500, upper: 2500 };

function isCpuForced(): boolean {
  return new URLSearchParams(window.location.search).get('cpu') === 'true';
}

function getOrientationParam(): PlanarVolumeOrientation {
  const value = new URLSearchParams(window.location.search).get('orientation');

  if (value && orientations.includes(value as PlanarVolumeOrientation)) {
    return value as PlanarVolumeOrientation;
  }

  return Enums.OrientationAxis.SAGITTAL;
}

let currentOrientation = getOrientationParam();

function syncExampleUrl(): void {
  const nextUrl = new URL(window.location.href);

  nextUrl.searchParams.set('orientation', currentOrientation);

  if (isCpuForced()) {
    nextUrl.searchParams.set('cpu', 'true');
  } else {
    nextUrl.searchParams.delete('cpu');
  }

  window.history.replaceState({}, '', nextUrl);
}

function getViewport(): PlanarViewportV2 {
  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (!renderingEngine) {
    throw new Error('Rendering engine has not been initialized');
  }

  return renderingEngine.getViewport(viewportId) as PlanarViewportV2;
}

function getDefaultDataPresentation() {
  return {
    invert: false,
    opacity: 1,
    visible: true,
    voiRange: defaultVoiRange,
  };
}

setTitleAndDescription(
  'Volume API On PlanarViewportV2',
  'Demonstrates volume-slice interaction using PlanarViewportV2. URL options: ?orientation=axial|coronal|sagittal&cpu=true'
);

const content = document.getElementById('content');

if (!content) {
  throw new Error('Missing #content container');
}

const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const renderModeInfo = document.createElement('div');
info.appendChild(renderModeInfo);

const orientationInfo = document.createElement('div');
info.appendChild(orientationInfo);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

function updateViewportInfo(): void {
  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (!renderingEngine) {
    return;
  }

  const viewport = renderingEngine.getViewport(viewportId) as
    | PlanarViewportV2
    | undefined;

  if (!viewport) {
    return;
  }

  renderModeInfo.innerText = `Data ${dataId} Render Mode: ${
    viewport.getDataRenderMode(dataId) ?? 'unknown'
  }`;
  orientationInfo.innerText = `Orientation: ${currentOrientation}`;
  rotationInfo.innerText = `Rotation: ${Math.round(
    viewport.getViewPresentation().rotation ?? 0
  )}`;
}

element.addEventListener(Events.CAMERA_MODIFIED, updateViewportInfo);

addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    const viewport = getViewport();

    viewport.setDataPresentation(dataId, {
      voiRange: highlightedBoneVoiRange,
    });
    viewport.render();
    updateViewportInfo();
  },
});

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    const viewport = getViewport();
    const currentPresentation = viewport.getDataPresentation(dataId);

    viewport.setDataPresentation(dataId, {
      invert: !(currentPresentation?.invert ?? false),
    });
    viewport.render();
    updateViewportInfo();
  },
});

addButtonToToolbar({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    const viewport = getViewport();

    viewport.resetCamera();

    const camera = viewport.getCamera();
    const { parallelScale, position, focalPoint } =
      cameraHelpers.getRandomlyTranslatedAndZoomedCameraProperties(camera, 50);

    viewport.setCamera({
      parallelScale,
      position: position as Types.Point3,
      focalPoint: focalPoint as Types.Point3,
    });
    viewport.render();
    updateViewportInfo();
  },
});

addButtonToToolbar({
  title: 'Apply random rotation',
  onClick: () => {
    const viewport = getViewport();

    viewport.setViewPresentation({ rotation: Math.random() * 360 });
    viewport.render();
    updateViewportInfo();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    const viewport = getViewport();

    viewport.resetCamera();
    viewport.setDataPresentation(dataId, getDefaultDataPresentation());
    viewport.render();
    updateViewportInfo();
  },
});

addDropdownToToolbar({
  options: {
    values: [...orientations],
    labels: ['Axial', 'Coronal', 'Sagittal'],
    defaultValue: currentOrientation,
  },
  onSelectedValueChange: (selectedValue) => {
    const nextOrientation = selectedValue as PlanarVolumeOrientation;
    const viewport = getViewport();

    currentOrientation = nextOrientation;
    syncExampleUrl();
    viewport.setOrientation(nextOrientation);
    viewport.render();
    updateViewportInfo();
  },
});

if (!isCpuForced()) {
  addSliderToToolbar({
    title: 'Slab Thickness',
    range: [0, 50],
    step: 0.1,
    defaultValue: 0,
    onSelectedValueChange: (value) => {
      const viewport = getViewport();
      const slabThickness = Number(value);

      viewport.setDataPresentation(dataId, {
        slabThickness: slabThickness > 0 ? slabThickness : undefined,
      });
      viewport.render();
      updateViewportInfo();
    },
    updateLabelOnChange: (value, label) => {
      label.innerText = `Slab Thickness: ${Number(value).toFixed(1)}`;
    },
  });
}

async function run() {
  syncExampleUrl();
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_V2,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  });

  const viewport = renderingEngine.getViewport(viewportId) as PlanarViewportV2;

  utilities.viewportV2DataSetMetadataProvider.add(dataId, {
    imageIds,
    volumeId,
  });

  await viewport.setDataIds([dataId], {
    orientation: currentOrientation,
    renderMode: isCpuForced() ? 'cpuVolume' : 'vtkVolume',
  });
  viewport.setDataPresentation(dataId, getDefaultDataPresentation());
  updateViewportInfo();
  viewport.render();
}

run();
