import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  eventTarget,
  getRenderingEngine,
  getRenderBackend,
  getEffectiveRenderBackend,
  setRenderBackend,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = 'myRenderingEngine';

const stackViewportId = 'STACK_AUTO';
const mprViewportId = 'MPR_AUTO';
const pinnedViewportId = 'STACK_PINNED_CPU';

const stackDataId = 'render-backend-switch:stack';
const volumeDataId = 'render-backend-switch:volume';
const pinnedDataId = 'render-backend-switch:pinned';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:RENDER_BACKEND_SWITCH_CT`;

setTitleAndDescription(
  'GenericViewport Render Backend Switch',
  'Live-switches the render backend (gpu | cpu | auto) of GenericViewport-based viewports without a page reload. ' +
    'The stack and MPR viewports follow the global setRenderBackend() value while keeping their slice, zoom/pan, and VOI; ' +
    'the third viewport is pinned to the CPU via a per-display-set renderBackend option and never switches.'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.gap = '4px';
content.appendChild(viewportGrid);

function createViewportElement(label: string): HTMLDivElement {
  const container = document.createElement('div');
  const caption = document.createElement('div');
  caption.innerText = label;
  const element = document.createElement('div');
  element.style.width = '350px';
  element.style.height = '350px';
  element.oncontextmenu = (e) => e.preventDefault();
  container.appendChild(caption);
  container.appendChild(element);
  viewportGrid.appendChild(container);
  return element;
}

const stackElement = createViewportElement('Stack (follows global backend)');
const mprElement = createViewportElement('MPR (follows global backend)');
const pinnedElement = createViewportElement('Stack (pinned to CPU)');

const statusPanel = document.createElement('pre');
statusPanel.id = 'backend-status';
content.appendChild(statusPanel);

const eventLog = document.createElement('pre');
eventLog.id = 'backend-events';
content.appendChild(eventLog);

function getViewport(viewportId: string): PlanarViewport | undefined {
  return getRenderingEngine(renderingEngineId)?.getViewport<PlanarViewport>(
    viewportId
  );
}

function describeViewport(viewportId: string, dataId: string): string {
  const viewport = getViewport(viewportId);

  if (!viewport) {
    return `${viewportId}: (not mounted)`;
  }

  const renderMode = viewport._debug.renderModes[dataId];
  const zoom = viewport.getZoom().toFixed(2);
  const imageIdIndex = viewport.getCurrentImageIdIndex();

  return `${viewportId}: renderMode=${renderMode} slice=${imageIdIndex} zoom=${zoom}`;
}

function updateStatusPanel(): void {
  statusPanel.innerText = [
    `configured backend: ${getRenderBackend()}`,
    `effective backend:  ${getEffectiveRenderBackend()}`,
    describeViewport(stackViewportId, stackDataId),
    describeViewport(mprViewportId, volumeDataId),
    describeViewport(pinnedViewportId, pinnedDataId),
  ].join('\n');
}

function logEvent(message: string): void {
  eventLog.innerText = `${message}\n${eventLog.innerText}`.slice(0, 2000);
}

eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, (evt) => {
  const { previous, current, effectiveBackend, reason } = (evt as CustomEvent)
    .detail;

  logEvent(
    `RENDER_BACKEND_CHANGED: ${previous} -> ${current} (effective: ${effectiveBackend}${
      reason ? `, reason: ${reason}` : ''
    })`
  );
  // The render-path swap is asynchronous; refresh the panel after it settles.
  setTimeout(updateStatusPanel, 500);
});

// Degradation signal demo: cornerstone never switches backends on its own.
// An application listens for this event and offers the user a switch to CPU
// rendering via setRenderBackend('cpu').
eventTarget.addEventListener(Events.WEBGL_CONTEXT_LOST, (evt) => {
  const { renderingEngineId: engineId, contextIndex } = (evt as CustomEvent)
    .detail;

  logEvent(
    `WEBGL_CONTEXT_LOST on ${engineId} (context ${contextIndex}) - consider setRenderBackend('cpu')`
  );
});

addButtonToToolbar({
  title: 'Backend: Auto',
  onClick: () => setRenderBackend('auto', 'example-toolbar'),
});

addButtonToToolbar({
  title: 'Backend: GPU',
  onClick: () => setRenderBackend('gpu', 'example-toolbar'),
});

addButtonToToolbar({
  title: 'Backend: CPU',
  onClick: () => setRenderBackend('cpu', 'example-toolbar'),
});

addButtonToToolbar({
  title: 'Next Image (stacks)',
  onClick: () => {
    for (const viewportId of [stackViewportId, pinnedViewportId]) {
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
  title: 'Set VOI Range',
  onClick: () => {
    const targets: Array<[string, string]> = [
      [stackViewportId, stackDataId],
      [mprViewportId, volumeDataId],
      [pinnedViewportId, pinnedDataId],
    ];

    for (const [viewportId, dataId] of targets) {
      const viewport = getViewport(viewportId);
      viewport?.setDisplaySetPresentation(dataId, {
        voiRange: { lower: -1500, upper: 2500 },
      });
      viewport?.render();
    }
  },
});

addButtonToToolbar({
  title: 'Apply Zoom And Pan',
  onClick: () => {
    for (const viewportId of [stackViewportId, mprViewportId]) {
      const viewport = getViewport(viewportId);

      if (!viewport) {
        continue;
      }

      viewport.setScale(1.35);
      viewport.setPan([42, -28]);
      viewport.render();
    }

    setTimeout(updateStatusPanel, 100);
  },
});

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId: stackViewportId,
      type: ViewportType.PLANAR_NEXT,
      element: stackElement,
      defaultOptions: { background: [0.2, 0, 0.2] as Types.Point3 },
    },
    {
      viewportId: mprViewportId,
      type: ViewportType.PLANAR_NEXT,
      element: mprElement,
      defaultOptions: { background: [0, 0.2, 0.2] as Types.Point3 },
    },
    {
      viewportId: pinnedViewportId,
      type: ViewportType.PLANAR_NEXT,
      element: pinnedElement,
      defaultOptions: { background: [0.2, 0.2, 0] as Types.Point3 },
    },
  ]);

  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  utilities.genericViewportDisplaySetMetadataProvider.add(stackDataId, {
    imageIds: stack,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(volumeDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(imageIds.length / 2),
    volumeId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(pinnedDataId, {
    imageIds: stack,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  const stackViewport = getViewport(stackViewportId);
  await stackViewport.setDisplaySets({
    displaySetId: stackDataId,
    options: {},
  });
  stackViewport.setDisplaySetPresentation(stackDataId, {
    voiRange: ctVoiRange,
  });

  const mprViewport = getViewport(mprViewportId);
  await mprViewport.setDisplaySets({
    displaySetId: volumeDataId,
    options: { orientation: OrientationAxis.SAGITTAL },
  });
  mprViewport.setDisplaySetPresentation(volumeDataId, {
    voiRange: ctVoiRange,
  });

  // Per-display-set pin: this viewport renders through the CPU path no
  // matter what the global renderBackend is, demonstrating mixed CPU/GPU
  // viewports living in the same rendering engine.
  const pinnedViewport = getViewport(pinnedViewportId);
  await pinnedViewport.setDisplaySets({
    displaySetId: pinnedDataId,
    options: { renderBackend: 'cpu' },
  });
  pinnedViewport.setDisplaySetPresentation(pinnedDataId, {
    voiRange: ctVoiRange,
  });

  renderingEngine.render();
  updateStatusPanel();
}

run();
