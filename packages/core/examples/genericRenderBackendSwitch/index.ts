import type { PlanarViewport, Types } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  eventTarget,
  getRenderingEngine,
  getRenderBackend,
  getEffectiveRenderBackend,
  imageLoader,
  setRenderBackend,
  triggerEvent,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import {
  fillStackSegmentationWithMockData,
  fillVolumeLabelmapWithMockData,
} from '../../../../utils/test/testUtils';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, OrientationAxis, Events } = Enums;
const {
  BidirectionalTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'RENDER_BACKEND_SWITCH_TOOL_GROUP';

const stackViewportId = 'STACK_AUTO';
const mprViewportId = 'MPR_AUTO';
const petViewportId = 'PET_STACK_AUTO';
const viewportIds = [stackViewportId, mprViewportId, petViewportId];

const stackDataId = 'render-backend-switch:stack';
const volumeDataId = 'render-backend-switch:volume';
const petDataId = 'render-backend-switch:pet-stack';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:RENDER_BACKEND_SWITCH_CT`;
const stackSegmentationId = 'RENDER_BACKEND_SWITCH_CT_STACK_SEGMENTATION';
const mprSegmentationId = 'RENDER_BACKEND_SWITCH_CT_MPR_SEGMENTATION';
const petSegmentationId = 'RENDER_BACKEND_SWITCH_PET_STACK_SEGMENTATION';
const mprSegmentationVolumeId = `${volumeLoaderScheme}:${mprSegmentationId}`;
const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const ctSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561';
const ptSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015';

type BidirectionalAxis = [
  [Types.Point3, Types.Point3],
  [Types.Point3, Types.Point3],
];

type FakeBidirectionalSpec = {
  viewportId: string;
  center: Types.Point2;
  longAxisCanvasLength: number;
  shortAxisCanvasLength: number;
};

const fakeBidirectionalSpecs: FakeBidirectionalSpec[] = [
  {
    viewportId: stackViewportId,
    center: [0.38, 0.46],
    longAxisCanvasLength: 54,
    shortAxisCanvasLength: 30,
  },
  {
    viewportId: mprViewportId,
    center: [0.52, 0.48],
    longAxisCanvasLength: 72,
    shortAxisCanvasLength: 38,
  },
  {
    viewportId: petViewportId,
    center: [0.5, 0.52],
    longAxisCanvasLength: 56,
    shortAxisCanvasLength: 32,
  },
];

setTitleAndDescription(
  'GenericViewport Render Backend Switch',
  'Live-switches the render backend (gpu | cpu | auto) of GenericViewport-based viewports without a page reload. ' +
    'The CT stack, CT MPR, and PET stack viewports follow the global setRenderBackend() value while keeping their slice, zoom/pan, and VOI.'
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
const petElement = createViewportElement('PET Stack (follows global backend)');

const statusPanel = document.createElement('pre');
statusPanel.id = 'backend-status';
content.appendChild(statusPanel);

const eventLog = document.createElement('pre');
eventLog.id = 'backend-events';
content.appendChild(eventLog);

const contextLostModal = document.createElement('div');
contextLostModal.id = 'context-lost-modal';
contextLostModal.style.position = 'fixed';
contextLostModal.style.inset = '0';
contextLostModal.style.display = 'none';
contextLostModal.style.alignItems = 'center';
contextLostModal.style.justifyContent = 'center';
contextLostModal.style.background = 'rgba(0, 0, 0, 0.45)';
contextLostModal.style.zIndex = '1000';

const contextLostPanel = document.createElement('div');
contextLostPanel.style.width = '360px';
contextLostPanel.style.padding = '16px';
contextLostPanel.style.borderRadius = '6px';
contextLostPanel.style.background = '#fff';
contextLostPanel.style.boxShadow = '0 16px 48px rgba(0, 0, 0, 0.3)';
contextLostPanel.style.fontFamily = 'sans-serif';

const contextLostTitle = document.createElement('div');
contextLostTitle.innerText = 'WebGL context lost';
contextLostTitle.style.fontWeight = '700';
contextLostTitle.style.marginBottom = '8px';

const contextLostMessage = document.createElement('div');
contextLostMessage.id = 'context-lost-message';
contextLostMessage.style.marginBottom = '16px';

const contextLostActions = document.createElement('div');
contextLostActions.style.display = 'flex';
contextLostActions.style.justifyContent = 'flex-end';
contextLostActions.style.gap = '8px';

const contextLostDismissButton = document.createElement('button');
contextLostDismissButton.innerText = 'Dismiss';
contextLostDismissButton.onclick = () => {
  contextLostModal.style.display = 'none';
};

const contextLostFallbackButton = document.createElement('button');
contextLostFallbackButton.innerText = 'Fallback to CPU';
contextLostFallbackButton.onclick = () => {
  setRenderBackend('cpu', 'webgl-context-lost-modal');
  contextLostModal.style.display = 'none';
  setTimeout(updateStatusPanel, 500);
};

contextLostActions.appendChild(contextLostDismissButton);
contextLostActions.appendChild(contextLostFallbackButton);
contextLostPanel.appendChild(contextLostTitle);
contextLostPanel.appendChild(contextLostMessage);
contextLostPanel.appendChild(contextLostActions);
contextLostModal.appendChild(contextLostPanel);
document.body.appendChild(contextLostModal);

function getViewport(viewportId: string): PlanarViewport | undefined {
  return getRenderingEngine(renderingEngineId)?.getViewport<PlanarViewport>(
    viewportId
  );
}

function setupBidirectionalToolGroup(): void {
  cornerstoneTools.addTool(BidirectionalTool);

  const toolGroup =
    ToolGroupManager.getToolGroup(toolGroupId) ??
    ToolGroupManager.createToolGroup(toolGroupId);

  if (!toolGroup) {
    return;
  }

  if (!toolGroup.hasTool(BidirectionalTool.toolName)) {
    toolGroup.addTool(BidirectionalTool.toolName);
  }

  toolGroup.setToolPassive(BidirectionalTool.toolName);

  for (const viewportId of viewportIds) {
    toolGroup.addViewport(viewportId, renderingEngineId);
  }
}

function createBidirectionalAxis(
  viewport: PlanarViewport,
  spec: FakeBidirectionalSpec
): BidirectionalAxis {
  const { clientWidth, clientHeight } = viewport.element;
  const centerCanvas: Types.Point2 = [
    clientWidth * spec.center[0],
    clientHeight * spec.center[1],
  ];
  const halfLongAxis = spec.longAxisCanvasLength / 2;
  const halfShortAxis = spec.shortAxisCanvasLength / 2;

  return [
    [
      viewport.canvasToWorld([centerCanvas[0] - halfLongAxis, centerCanvas[1]]),
      viewport.canvasToWorld([centerCanvas[0] + halfLongAxis, centerCanvas[1]]),
    ],
    [
      viewport.canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] - halfShortAxis,
      ]),
      viewport.canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] + halfShortAxis,
      ]),
    ],
  ];
}

function addFakeBidirectionalAnnotations(): void {
  for (const spec of fakeBidirectionalSpecs) {
    const viewport = getViewport(spec.viewportId);

    if (!viewport) {
      continue;
    }

    BidirectionalTool.hydrate(
      spec.viewportId,
      createBidirectionalAxis(viewport, spec)
    );
  }
}

async function addSegmentationOverlays(
  ctStackImageIds: string[],
  ctVolumeImageIds: string[],
  petStackImageIds: string[]
): Promise<void> {
  const stackLabelmapImages =
    imageLoader.createAndCacheDerivedLabelmapImages(ctStackImageIds);
  const petLabelmapImages =
    imageLoader.createAndCacheDerivedLabelmapImages(petStackImageIds);

  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: mprSegmentationVolumeId,
  });

  fillStackSegmentationWithMockData({
    cornerstone,
    imageIds: ctStackImageIds,
    segmentationImageIds: stackLabelmapImages.map((image) => image.imageId),
    centerOffset: [-42, 0, 0],
    innerValue: 1,
    outerValue: 2,
  });
  fillStackSegmentationWithMockData({
    cornerstone,
    imageIds: petStackImageIds,
    segmentationImageIds: petLabelmapImages.map((image) => image.imageId),
    centerOffset: [38, 12, 0],
    innerValue: 3,
    outerValue: 4,
  });
  fillVolumeLabelmapWithMockData({
    cornerstone,
    volumeId: mprSegmentationVolumeId,
    centerOffset: [32, -18, 0],
    scale: [1.35, 1, 1.2],
  });

  segmentation.addSegmentations([
    {
      segmentationId: stackSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: stackLabelmapImages.map((image) => image.imageId),
          referencedImageIds: ctStackImageIds,
        },
      },
      config: {
        label: 'CT Stack Labelmap',
      },
    },
    {
      segmentationId: mprSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: mprSegmentationVolumeId,
          referencedVolumeId: volumeId,
          referencedImageIds: ctVolumeImageIds,
        },
      },
      config: {
        label: 'CT MPR Labelmap',
      },
    },
    {
      segmentationId: petSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: petLabelmapImages.map((image) => image.imageId),
          referencedImageIds: petStackImageIds,
        },
      },
      config: {
        label: 'PET Stack Labelmap',
      },
    },
  ]);

  await segmentation.addLabelmapRepresentationToViewportMap({
    [stackViewportId]: [
      {
        segmentationId: stackSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ],
    [mprViewportId]: [
      {
        segmentationId: mprSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        config: {
          useSliceRendering: true,
        },
      },
    ],
    [petViewportId]: [
      {
        segmentationId: petSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ],
  });

  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
    {
      fillAlpha: 0.45,
      fillAlphaInactive: 0.45,
      renderFill: true,
      renderFillInactive: true,
      renderOutline: true,
      renderOutlineInactive: true,
    }
  );

  segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    stackSegmentationId
  );
  segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    mprSegmentationId
  );
  segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    petSegmentationId
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
    describeViewport(petViewportId, petDataId),
  ].join('\n');
}

function logEvent(message: string): void {
  eventLog.innerText = `${message}\n${eventLog.innerText}`.slice(0, 2000);
}

function showContextLostModal(detail: {
  renderingEngineId?: string;
  contextIndex?: number;
  simulated?: boolean;
}): void {
  const engineId = detail.renderingEngineId ?? renderingEngineId;
  const contextIndex = detail.contextIndex ?? 0;

  contextLostMessage.innerText = `Context ${contextIndex} on ${engineId} was lost. Fallback to CPU rendering?`;
  contextLostModal.style.display = 'flex';
}

function throwWebGLContextLost(): void {
  triggerEvent(eventTarget, Events.WEBGL_CONTEXT_LOST, {
    renderingEngineId,
    contextIndex: 0,
    simulated: true,
  });
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
  const detail = (evt as CustomEvent).detail || {};
  const { renderingEngineId: engineId, contextIndex } = detail;

  logEvent(
    `WEBGL_CONTEXT_LOST on ${engineId} (context ${contextIndex}) - consider setRenderBackend('cpu')`
  );
  showContextLostModal(detail);
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
  title: 'Throw Context Lost',
  onClick: () => throwWebGLContextLost(),
});

addButtonToToolbar({
  title: 'Next Image (stacks)',
  onClick: () => {
    for (const viewportId of [stackViewportId, petViewportId]) {
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
    for (const viewportId of [stackViewportId, mprViewportId, petViewportId]) {
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

addButtonToToolbar({
  title: 'Add Fake Bidirectionals',
  onClick: () => addFakeBidirectionalAnnotations(),
});

async function run() {
  await initDemo();

  const [ctImageIds, ptImageIds] = await Promise.all([
    createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID: ctSeriesInstanceUID,
      wadoRsRoot,
    }),
    createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID: ptSeriesInstanceUID,
      wadoRsRoot,
    }),
  ]);

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
      viewportId: petViewportId,
      type: ViewportType.PLANAR_NEXT,
      element: petElement,
      defaultOptions: { background: [0.2, 0.2, 0] as Types.Point3 },
    },
  ]);

  setupBidirectionalToolGroup();

  const stack = [ctImageIds[0], ctImageIds[1], ctImageIds[2]];
  const ptStack = [ptImageIds[0], ptImageIds[1], ptImageIds[2]];
  const ctVolume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: ctImageIds,
  });

  ctVolume.load();

  utilities.genericViewportDisplaySetMetadataProvider.add(stackDataId, {
    imageIds: stack,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(volumeDataId, {
    imageIds: ctImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
    volumeId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(petDataId, {
    imageIds: ptStack,
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

  const petViewport = getViewport(petViewportId);
  await petViewport.setDisplaySets({
    displaySetId: petDataId,
    options: {},
  });

  renderingEngine.render();
  await addSegmentationOverlays(stack, ctImageIds, ptStack);
  addFakeBidirectionalAnnotations();
  renderingEngine.render();
  updateStatusPanel();
}

run();
