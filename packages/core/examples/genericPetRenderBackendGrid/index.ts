import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = 'petPlanarBackendRenderingEngine';

const viewportIds = {
  PET_STACK_GPU: 'PET_STACK_GPU',
  PET_SAGITTAL_GPU: 'PET_SAGITTAL_GPU',
  PET_STACK_CPU: 'PET_STACK_CPU',
  PET_SAGITTAL_CPU: 'PET_SAGITTAL_CPU',
} as const;

const petStackDataId = 'pet-planar-backend-grid:stack';
const petVolumeDataId = 'pet-planar-backend-grid:volume';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const petVolumeId = `${volumeLoaderScheme}:PET_PLANAR_BACKEND_GRID_VOLUME`;

const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const ptSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015';

type ViewportSpec = {
  viewportId: string;
  dataId: string;
  label: string;
  renderBackend: 'gpu' | 'cpu';
  orientation?: typeof OrientationAxis.SAGITTAL;
};

const viewportSpecs: ViewportSpec[] = [
  {
    viewportId: viewportIds.PET_STACK_GPU,
    dataId: petStackDataId,
    label: 'PET Stack - GPU',
    renderBackend: 'gpu',
  },
  {
    viewportId: viewportIds.PET_SAGITTAL_GPU,
    dataId: petVolumeDataId,
    label: 'PET Sagittal - GPU',
    renderBackend: 'gpu',
    orientation: OrientationAxis.SAGITTAL,
  },
  {
    viewportId: viewportIds.PET_STACK_CPU,
    dataId: petStackDataId,
    label: 'PET Stack - CPU',
    renderBackend: 'cpu',
  },
  {
    viewportId: viewportIds.PET_SAGITTAL_CPU,
    dataId: petVolumeDataId,
    label: 'PET Sagittal - CPU',
    renderBackend: 'cpu',
    orientation: OrientationAxis.SAGITTAL,
  },
];

setTitleAndDescription(
  'PET Planar Render Backend Grid',
  'Four PET Planar GenericViewport viewports. Top row is pinned to GPU rendering, bottom row is pinned to CPU rendering; left column is stack-like PET and right column is sagittal PET volume slicing.'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = 'repeat(2, 380px)';
viewportGrid.style.gap = '8px';
content.appendChild(viewportGrid);

const viewportElements = new Map<string, HTMLDivElement>();

function createViewportElement(spec: ViewportSpec): HTMLDivElement {
  const container = document.createElement('div');
  const caption = document.createElement('div');
  caption.innerText = spec.label;
  caption.style.fontFamily = 'sans-serif';
  caption.style.fontSize = '14px';
  caption.style.marginBottom = '4px';

  const element = document.createElement('div');
  element.style.width = '380px';
  element.style.height = '320px';
  element.oncontextmenu = (e) => e.preventDefault();

  container.appendChild(caption);
  container.appendChild(element);
  viewportGrid.appendChild(container);
  viewportElements.set(spec.viewportId, element);

  return element;
}

for (const spec of viewportSpecs) {
  createViewportElement(spec);
}

const statusPanel = document.createElement('pre');
statusPanel.id = 'pet-backend-grid-status';
content.appendChild(statusPanel);

function getViewport(viewportId: string): PlanarViewport | undefined {
  return getRenderingEngine(renderingEngineId)?.getViewport<PlanarViewport>(
    viewportId
  );
}

function describeViewport(spec: ViewportSpec): string {
  const viewport = getViewport(spec.viewportId);

  if (!viewport) {
    return `${spec.viewportId}: not mounted`;
  }

  return `${spec.viewportId}: requested=${spec.renderBackend} actual=${viewport.getDisplaySetRenderMode(
    spec.dataId
  )} slice=${viewport.getCurrentImageIdIndex()}`;
}

function updateStatusPanel(): void {
  statusPanel.innerText = viewportSpecs.map(describeViewport).join('\n');
}

function renderAllViewports(): void {
  for (const spec of viewportSpecs) {
    getViewport(spec.viewportId)?.render();
  }

  updateStatusPanel();
}

addButtonToToolbar({
  title: 'Next Stack Image',
  onClick: () => {
    for (const viewportId of [
      viewportIds.PET_STACK_GPU,
      viewportIds.PET_STACK_CPU,
    ]) {
      const viewport = getViewport(viewportId);

      if (!viewport) {
        continue;
      }

      const nextIndex = Math.min(
        viewport.getCurrentImageIdIndex() + 1,
        viewport.getImageIds().length - 1
      );

      void viewport.setImageIdIndex(nextIndex);
    }

    setTimeout(updateStatusPanel, 100);
  },
});

addButtonToToolbar({
  title: 'Reset Viewports',
  onClick: () => {
    for (const spec of viewportSpecs) {
      const viewport = getViewport(spec.viewportId);

      viewport?.resetViewState();
    }

    renderAllViewports();
  },
});

async function run() {
  await initDemo();

  const petImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID: ptSeriesInstanceUID,
    wadoRsRoot,
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports(
    viewportSpecs.map((spec) => ({
      viewportId: spec.viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: viewportElements.get(spec.viewportId),
      defaultOptions: {
        background: [0, 0, 0] as Types.Point3,
      },
    }))
  );

  utilities.genericViewportDisplaySetMetadataProvider.add(petStackDataId, {
    imageIds: petImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(petImageIds.length / 2),
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(petVolumeDataId, {
    imageIds: petImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(petImageIds.length / 2),
    volumeId: petVolumeId,
  });

  await Promise.all(
    viewportSpecs.map(async (spec) => {
      const viewport = getViewport(spec.viewportId);

      await viewport.setDisplaySets({
        displaySetId: spec.dataId,
        options: {
          renderBackend: spec.renderBackend,
          ...(spec.orientation ? { orientation: spec.orientation } : {}),
        },
      });
    })
  );

  renderAllViewports();
}

run();
