import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
  volumeLoader,
  eventTarget,
  registerWebGPURenderBackend,
  isWebGPURenderingAvailable,
  getWebGPUViewportDebugInfo,
  setWebGPUViewportBackground,
  getRenderBackend,
  setRenderBackend,
  getEffectiveRenderBackend,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import * as cornerstone from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addBrushSizeSlider,
  addSegmentIndexDropdown,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import { getStringUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import { fillVolumeLabelmapWithMockData } from '../../../../utils/test/testUtils';

const {
  ToolGroupManager,
  segmentation,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  BrushTool,
  RectangleScissorsTool,
  CircleScissorsTool,
  PaintFillTool,
  Enums: csToolsEnums,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

const toolGroupId = 'WEBGPU_ORTHO_TOOL_GROUP';
const segmentationId = 'WEBGPU_ORTHO_SEGMENTATION';

const leftClickTools = [
  WindowLevelTool.toolName,
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  ArrowAnnotateTool.toolName,
  PlanarFreehandROITool.toolName,
];
const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  SphereBrush: 'SphereBrush',
  CircularEraser: 'CircularEraser',
};
const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
};
const NO_SEGMENTATION_TOOL = 'None';
const segmentationTools = [
  brushInstanceNames.CircularBrush,
  brushInstanceNames.SphereBrush,
  brushInstanceNames.CircularEraser,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  PaintFillTool.toolName,
];

let activeLeftClickTool = WindowLevelTool.toolName;
let selectedAnnotationTool = WindowLevelTool.toolName;

function setLeftClickTool(toolName: string): void {
  if (toolName === activeLeftClickTool) {
    return;
  }

  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  toolGroup.setToolPassive(activeLeftClickTool);
  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  activeLeftClickTool = toolName;
}

function setUpToolGroup() {
  [
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollTool,
    LengthTool,
    ProbeTool,
    RectangleROITool,
    EllipticalROITool,
    CircleROITool,
    BidirectionalTool,
    AngleTool,
    ArrowAnnotateTool,
    PlanarFreehandROITool,
    BrushTool,
    RectangleScissorsTool,
    CircleScissorsTool,
    PaintFillTool,
  ].forEach((tool) => cornerstoneTools.addTool(tool));

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  for (const toolName of leftClickTools) {
    toolGroup.addTool(toolName);
  }
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  Object.entries(brushStrategies).forEach(([instanceName, strategy]) => {
    toolGroup.addToolInstance(instanceName, BrushTool.toolName, {
      activeStrategy: strategy,
    });
  });
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(PaintFillTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  for (const toolName of [...leftClickTools, ...segmentationTools]) {
    if (toolName !== activeLeftClickTool) {
      toolGroup.setToolPassive(toolName);
    }
  }

  return toolGroup;
}

// Annotation / manipulation tool on left click.
addDropdownToToolbar({
  options: { values: leftClickTools, defaultValue: selectedAnnotationTool },
  onSelectedValueChange: (newSelectedToolName) => {
    selectedAnnotationTool = newSelectedToolName as string;
    setLeftClickTool(selectedAnnotationTool);
  },
});

// Segmentation editing tools on left click; 'None' hands left click back to
// the annotation dropdown's selection.
addDropdownToToolbar({
  options: {
    values: [NO_SEGMENTATION_TOOL, ...segmentationTools],
    defaultValue: NO_SEGMENTATION_TOOL,
  },
  onSelectedValueChange: (newSelectedToolName) => {
    const name = String(newSelectedToolName);

    if (name === NO_SEGMENTATION_TOOL) {
      setLeftClickTool(selectedAnnotationTool);
    } else {
      setLeftClickTool(name);
    }
  },
});

addBrushSizeSlider({ toolGroupId });
addSegmentIndexDropdown(segmentationId, [1, 2]);

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events, OrientationAxis } = Enums;

const renderingEngineId = 'myRenderingEngine';
const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const dataId = 'webgpu-ortho:ct';

const viewportSpecs = [
  { viewportId: 'CT_SAGITTAL_WEBGPU', orientation: OrientationAxis.SAGITTAL },
  { viewportId: 'CT_CORONAL_WEBGPU', orientation: OrientationAxis.CORONAL },
];

setTitleAndDescription(
  'Orthographic GenericViewports on the WebGPU render backend',
  'Sagittal and coronal MPR of a CT volume rendered through the experimental ' +
    'vtk.js WebGPU view API (volume-slice render mode "webgpuVolume"). The ' +
    'volume is fully loaded before mounting (the WebGPU texture uploads ' +
    'once; progressive streaming is a follow-up). Use the buttons to ' +
    'live-switch between the webgpu, gpu (WebGL) and cpu backends and ' +
    'compare the rendered slices. A mock ellipsoid labelmap segmentation is ' +
    'overlaid on both viewports (slice rendering); edit it with the brush, ' +
    'eraser, scissors and paint-fill tools in the segmentation dropdown ' +
    '(with brush size and segment index controls). Left click: the tool ' +
    'selected in the dropdown (window/level or annotations). Middle click: ' +
    'pan. Right click: zoom. Mouse wheel: scroll slices. Tip: append ' +
    '?renderBackend=webgpu|gpu|cpu to the URL to pick the initial backend ' +
    '(the webgpu backend clears to dark blue, WebGL to purple, so you can ' +
    'tell them apart at a glance).'
);

const size = '512px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.flexWrap = 'wrap';

const elements = viewportSpecs.map(({ viewportId }) => {
  const element = document.createElement('div');
  element.id = `element-${viewportId}`;
  element.style.width = size;
  element.style.height = size;
  element.style.flexShrink = '0';
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
  return element;
});

content.appendChild(viewportGrid);

const debugPanel = document.createElement('pre');
debugPanel.id = 'webgpu-backend-debug';
debugPanel.style.border = '1px solid #555';
debugPanel.style.padding = '8px';
debugPanel.style.marginTop = '8px';
debugPanel.style.maxWidth = '1040px';
debugPanel.style.whiteSpace = 'pre-wrap';
debugPanel.innerText = 'loading volume...';
content.appendChild(debugPanel);

function getViewport(viewportId: string): PlanarViewport | undefined {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  return renderingEngine?.getViewport<PlanarViewport>(viewportId);
}

function updateDebugPanel(): void {
  const lines: string[] = [];

  lines.push(`webgpu available: ${isWebGPURenderingAvailable()}`);
  lines.push(`configured backend: ${getRenderBackend()}`);
  lines.push(`effective backend: ${getEffectiveRenderBackend()}`);

  for (const { viewportId, orientation } of viewportSpecs) {
    const viewport = getViewport(viewportId);
    const renderMode = viewport?.getDisplaySetRenderMode?.(dataId);
    const webgpuInfo = getWebGPUViewportDebugInfo(viewportId);
    const gpuLine = webgpuInfo
      ? `WebGPU device ${
          webgpuInfo.initialized ? 'initialized' : 'initializing...'
        }${webgpuInfo.adapter ? ` (${webgpuInfo.adapter})` : ''}`
      : 'WebGL/CPU surface';

    lines.push(
      `${viewportId} [${orientation}]: renderMode=${
        renderMode ?? '(none)'
      } | ${gpuLine}`
    );
  }

  debugPanel.innerText = lines.join('\n');
}

// Distinct clear color for the webgpu windows so it is immediately visible
// which backend produced the frame (WebGL keeps the purple viewport
// background).
const WEBGPU_BACKGROUND: [number, number, number] = [0.05, 0.12, 0.3];

function applyWebGPUBackground(): void {
  viewportSpecs.forEach(({ viewportId }) => {
    setWebGPUViewportBackground(viewportId, WEBGPU_BACKGROUND);
  });
}

function switchBackend(backend: string): void {
  setRenderBackend(backend, 'example-toolbar');

  if (backend === 'webgpu') {
    applyWebGPUBackground();
  }

  viewportSpecs.forEach(({ viewportId }) => getViewport(viewportId)?.render());
  updateDebugPanel();
}

addButtonToToolbar({
  title: 'Use webgpu backend',
  onClick: () => switchBackend('webgpu'),
});

addButtonToToolbar({
  title: 'Use gpu (WebGL) backend',
  onClick: () => switchBackend('gpu'),
});

addButtonToToolbar({
  title: 'Use cpu backend',
  onClick: () => switchBackend('cpu'),
});

function scrollViewports(delta: number): void {
  viewportSpecs.forEach(({ viewportId }) => {
    const viewport = getViewport(viewportId);

    if (!viewport) {
      return;
    }

    // setImageIdIndex/scroll update the view state without scheduling a
    // render; volume slice paths repaint only on an explicit render().
    void viewport.scroll(delta).then(() => viewport.render());
  });
}

addButtonToToolbar({
  title: 'Next Slice',
  onClick: () => scrollViewports(1),
});

addButtonToToolbar({
  title: 'Previous Slice',
  onClick: () => scrollViewports(-1),
});

addButtonToToolbar({
  title: 'Reset Viewports',
  onClick: () => {
    viewportSpecs.forEach(({ viewportId }) => {
      const viewport = getViewport(viewportId);

      if (!viewport) {
        return;
      }

      viewport.resetViewState();
      viewport.setDisplaySetPresentation(dataId, { voiRange: ctVoiRange });
      viewport.render();
    });
  },
});

eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, () => {
  updateDebugPanel();
});

function waitForVolumeLoaded(targetVolumeId: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

      if (detail?.volumeId !== targetVolumeId) {
        return;
      }

      eventTarget.removeEventListener(
        Events.IMAGE_VOLUME_LOADING_COMPLETED,
        handler
      );
      resolve();
    };

    eventTarget.addEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handler
    );
  });
}

async function run() {
  await initDemo();

  if (isWebGPURenderingAvailable()) {
    registerWebGPURenderBackend();
  } else {
    debugPanel.innerText =
      'WebGPU is not available in this browser (navigator.gpu missing); falling back to the default backend.';
  }

  // ?renderBackend=webgpu|gpu|cpu picks the initial backend (default webgpu
  // when available).
  const requestedBackend = getStringUrlParam('renderBackend');
  const initialBackend =
    requestedBackend && ['webgpu', 'gpu', 'cpu'].includes(requestedBackend)
      ? requestedBackend
      : isWebGPURenderingAvailable()
        ? 'webgpu'
        : 'gpu';

  if (initialBackend !== 'webgpu' || isWebGPURenderingAvailable()) {
    setRenderBackend(initialBackend, 'example-default');
  }

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Middle chunk of the series: enough anatomy for sagittal/coronal MPR while
  // bounding the GPU texture size (each webgpu viewport currently holds its
  // own copy of the volume texture).
  const middle = Math.floor(imageIds.length / 2);
  const volumeImageIds = imageIds.slice(
    Math.max(0, middle - 80),
    Math.min(imageIds.length, middle + 80)
  );

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });
  const loaded = waitForVolumeLoaded(volumeId);
  volume.load();
  await loaded;
  debugPanel.innerText = 'volume loaded, mounting viewports...';

  const toolGroup = setUpToolGroup();
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports(
    viewportSpecs.map(({ viewportId, orientation }, index) => ({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: elements[index],
      defaultOptions: {
        orientation,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    }))
  );

  viewportSpecs.forEach(({ viewportId }) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  utilities.genericViewportDisplaySetMetadataProvider.add(dataId, {
    kind: 'planar',
    imageIds: volumeImageIds,
    initialImageIdIndex: Math.floor(volumeImageIds.length / 2),
    volumeId,
  });

  await Promise.all(
    viewportSpecs.map(async ({ viewportId, orientation }) => {
      const viewport = getViewport(viewportId);

      await viewport.setDisplaySets({
        displaySetId: dataId,
        options: { orientation },
      });
      viewport.setDisplaySetPresentation(dataId, { voiRange: ctVoiRange });
      viewport.render();
    })
  );

  viewportSpecs.forEach(({ viewportId }) => {
    const element = document.getElementById(`element-${viewportId}`);
    element?.addEventListener(Events.IMAGE_RENDERED, () => {
      // Backend switches remount asynchronously and recreate the WebGPU
      // window with the default background; re-tint it (idempotent, only
      // re-renders when the color actually changed).
      if (
        getEffectiveRenderBackend() === 'webgpu' &&
        setWebGPUViewportBackground(viewportId, WEBGPU_BACKGROUND)
      ) {
        getViewport(viewportId)?.render();
      }

      updateDebugPanel();
    });
  });

  // Fake labelmap segmentation: derived labelmap volume filled with mock
  // ellipsoids, mounted as slice-rendering overlays on both MPR viewports.
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });
  fillVolumeLabelmapWithMockData({
    volumeId: segmentationId,
    cornerstone,
  });
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  const segmentationRepresentation = {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
    config: {
      useSliceRendering: true,
    },
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportSpecs[0].viewportId]: [segmentationRepresentation],
    [viewportSpecs[1].viewportId]: [segmentationRepresentation],
  });

  if (getEffectiveRenderBackend() === 'webgpu') {
    applyWebGPUBackground();
    viewportSpecs.forEach(({ viewportId }) =>
      getViewport(viewportId)?.render()
    );
  }

  updateDebugPanel();
}

run();
