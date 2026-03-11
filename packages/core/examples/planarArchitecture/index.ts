import {
  Enums,
  PlanarViewportV2,
  RenderingEngineV2,
  utilities,
} from '@cornerstonejs/core';
import {
  addTool,
  Enums as csToolsEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  ZoomTool,
} from '@cornerstonejs/tools';
import {
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

type PlanarOrientation =
  | Enums.OrientationAxis.ACQUISITION
  | Enums.OrientationAxis.AXIAL
  | Enums.OrientationAxis.CORONAL
  | Enums.OrientationAxis.SAGITTAL;

const orientations = [
  Enums.OrientationAxis.ACQUISITION,
  Enums.OrientationAxis.AXIAL,
  Enums.OrientationAxis.CORONAL,
  Enums.OrientationAxis.SAGITTAL,
] as const;
const { MouseBindings } = csToolsEnums;

function getOrientationParam(): PlanarOrientation {
  const searchParams = new URLSearchParams(window.location.search);
  const value = searchParams.get('orientation');

  if (value && orientations.includes(value as PlanarOrientation)) {
    return value as PlanarOrientation;
  }

  return Enums.OrientationAxis.AXIAL;
}

function getNumberParam(name: string): number | undefined {
  const searchParams = new URLSearchParams(window.location.search);
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
const dataId = 'ct-planar';
const toolGroupId = 'planarViewportV2Tools';
let currentOrientation = getOrientationParam();
const cpuImageThreshold = getNumberParam('cpuImageThreshold');
const cpuVolumeThreshold = getNumberParam('cpuVolumeThreshold');

function getCpuThresholds() {
  if (cpuImageThreshold === undefined && cpuVolumeThreshold === undefined) {
    return;
  }

  return {
    ...(cpuImageThreshold !== undefined ? { image: cpuImageThreshold } : {}),
    ...(cpuVolumeThreshold !== undefined ? { volume: cpuVolumeThreshold } : {}),
  };
}

function syncExampleUrl(): void {
  const nextUrl = new URL(window.location.href);

  nextUrl.searchParams.set('orientation', currentOrientation);

  if (cpuImageThreshold === undefined) {
    nextUrl.searchParams.delete('cpuImageThreshold');
  } else {
    nextUrl.searchParams.set('cpuImageThreshold', String(cpuImageThreshold));
  }

  if (cpuVolumeThreshold === undefined) {
    nextUrl.searchParams.delete('cpuVolumeThreshold');
  } else {
    nextUrl.searchParams.set('cpuVolumeThreshold', String(cpuVolumeThreshold));
  }

  window.history.replaceState({}, '', nextUrl);
}

setTitleAndDescription(
  'Planar Viewport Architecture POC',
  'Bare-minimum usage of the new ViewportV2 + PlanarViewportV2 proof of concept. URL options: ?orientation=acquisition|axial|coronal|sagittal&cpuImageThreshold=100000&cpuVolumeThreshold=100000'
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
element.oncontextmenu = () => false;

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText =
  'Use the toolbar to change orientation. Interaction tools: mouse wheel scrolls slices, middle-drag pans, right-drag zooms. Acquisition uses the image paths, axial/coronal/sagittal use the volume paths. You can also set cpuImageThreshold and cpuVolumeThreshold in the URL.';

content.append(instructions);
// ============================= //

let viewport: PlanarViewportV2 | undefined;

function addToolbar() {
  addDropdownToToolbar({
    labelText: 'Orientation',
    options: {
      values: [...orientations],
      labels: ['Acquisition', 'Axial', 'Coronal', 'Sagittal'],
      defaultValue: currentOrientation,
    },
    onSelectedValueChange: (selectedValue) => {
      const nextOrientation = selectedValue as PlanarOrientation;

      if (!viewport) {
        return;
      }

      currentOrientation = nextOrientation;
      syncExampleUrl();

      void viewport.setDataIds([dataId], {
        orientation: nextOrientation,
        cpuThresholds: getCpuThresholds(),
      });
    },
  });
}

addToolbar();

async function run() {
  syncExampleUrl();
  await initDemo();
  addTool(PanTool);
  addTool(ZoomTool);
  addTool(StackScrollTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  const imageIds = await createImageIdsAndCacheMetaData({
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
  (
    window as Window & { planarViewportV2?: PlanarViewportV2 }
  ).planarViewportV2 = viewport;
  toolGroup.addViewport(viewportId, renderingEngine.id);

  utilities.viewportV2DataSetMetadataProvider.add(dataId, {
    imageIds,
  });
  await viewport.setDataIds([dataId], {
    orientation: currentOrientation,
    cpuThresholds: getCpuThresholds(),
  });
  viewport.setProperties({
    voiRange: ctVoiRange,
  });
  viewport.render();
}

run();
