import {
  Enums,
  imageLoader,
  PlanarViewportV2,
  RenderingEngineV2,
  utilities,
} from '@cornerstonejs/core';
import {
  cornerstoneNiftiImageLoader,
  createNiftiImageIdsAndCacheMetadata,
} from '@cornerstonejs/nifti-volume-loader';
import {
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

type PlanarOrientation =
  | Enums.OrientationAxis.AXIAL
  | Enums.OrientationAxis.CORONAL
  | Enums.OrientationAxis.SAGITTAL;

const searchParams = new URLSearchParams(window.location.search);

function getNumberParam(name: string): number | undefined {
  const value = searchParams.get(name);

  if (value == null) {
    return;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const viewportId = 'planarViewportV2';
const dataId = searchParams.get('dataId') || 'ct-planar';
const orientation =
  (searchParams.get('orientation') as PlanarOrientation) ||
  Enums.OrientationAxis.AXIAL;
const cpuVoxelThreshold = getNumberParam('cpuVoxelThreshold');
const initialImageIdIndex = getNumberParam('initialImageIdIndex') ?? 0;
const imageLimit = getNumberParam('limit');
const niftiUrl = searchParams.get('niftiUrl') || undefined;
const renderMode =
  searchParams.get('renderMode') || (niftiUrl ? 'cpuVolume' : undefined);
const volumeId =
  searchParams.get('volumeId') ||
  (niftiUrl ? `nifti:${niftiUrl}` : undefined) ||
  undefined;

setTitleAndDescription(
  'Planar Viewport Architecture POC',
  'Bare-minimum usage of the new ViewportV2 + PlanarViewportV2 proof of concept. URL options: ?orientation=axial|coronal|sagittal&renderMode=cpu2d|vtkImage|vtkVolume|cpuVolume&dataId=ct-planar&initialImageIdIndex=0&cpuVoxelThreshold=100000&limit=32&volumeId=myVolume&niftiUrl=https://...nii.gz'
);

// ======== Set up page ======== //
const content = document.getElementById('content');

if (!content) {
  throw new Error('Missing #content container');
}

const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';
element.style.background = '#000';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText =
  'Use the toolbar dropdown or URL query parameters to change orientation and render mode. Add niftiUrl=...&renderMode=cpuVolume to load a remote volume URL into the CPU slice path.';

content.append(instructions);
// ============================= //

let viewport: PlanarViewportV2 | undefined;

function syncOrientationInUrl(nextOrientation: PlanarOrientation) {
  const nextSearchParams = new URLSearchParams(window.location.search);

  nextSearchParams.set('orientation', nextOrientation);
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?${nextSearchParams.toString()}`
  );
}

function addToolbar() {
  addDropdownToToolbar({
    labelText: 'Orientation',
    options: {
      values: [
        Enums.OrientationAxis.AXIAL,
        Enums.OrientationAxis.CORONAL,
        Enums.OrientationAxis.SAGITTAL,
      ],
      labels: ['Axial', 'Coronal', 'Sagittal'],
      defaultValue: orientation,
    },
    onSelectedValueChange: (selectedValue) => {
      const nextOrientation = selectedValue as PlanarOrientation;

      syncOrientationInUrl(nextOrientation);

      if (!viewport) {
        return;
      }

      void viewport.setDataIds([dataId], {
        orientation: nextOrientation,
        cpuVoxelThreshold,
        renderMode,
      });
    },
  });
}

addToolbar();

async function run() {
  await initDemo();

  const imageIds = niftiUrl
    ? await (async () => {
        imageLoader.registerImageLoader('nifti', cornerstoneNiftiImageLoader);
        return createNiftiImageIdsAndCacheMetadata({ url: niftiUrl });
      })()
    : await createImageIdsAndCacheMetaData({
        StudyInstanceUID:
          '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
        SeriesInstanceUID:
          '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
        wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
      });
  const renderingEngine = new RenderingEngineV2('renderingEngineV2');
  renderingEngine.enableViewport({
    viewportId,
    type: Enums.ViewportType.PLANAR_V2,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2],
    },
  });
  viewport = renderingEngine.getViewport(viewportId) as PlanarViewportV2;
  const resolvedImageIds =
    imageLimit && imageLimit > 0 ? imageIds.slice(0, imageLimit) : imageIds;

  utilities.viewportV2DataSetMetadataProvider.add(dataId, {
    imageIds: resolvedImageIds,
    initialImageIdIndex,
    volumeId,
  });
  await viewport.setDataIds([dataId], {
    orientation,
    cpuVoxelThreshold,
    renderMode,
  });
  viewport.setProperties({
    voiRange: ctVoiRange,
  });
  viewport.render();
}

run();
