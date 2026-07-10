import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  imageLoader,
  utilities,
  eventTarget,
  registerWebGPURenderBackend,
  isWebGPURenderingAvailable,
  getWebGPUViewportDebugInfo,
  getRenderBackend,
  setRenderBackend,
  getEffectiveRenderBackend,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
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

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  segmentation,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  BrushTool,
  RectangleScissorsTool,
  CircleScissorsTool,
  PaintFillTool,
  Enums: csToolsEnums,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

const { ViewportType, Events } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK_WEBGPU';
const stackDataId = 'webgpu-stack:primary';
const toolGroupId = 'WEBGPU_STACK_TOOL_GROUP';
const segmentationId = 'WEBGPU_STACK_SEGMENTATION';

/**
 * Fills the derived labelmap images with a fake two-segment segmentation:
 * segment 1 is a large circle left of center, segment 2 a smaller circle to
 * the right; both grow slightly per slice so scrolling visibly changes the
 * labelmap.
 */
function paintFakeSegmentation(
  segImages: Awaited<
    ReturnType<typeof imageLoader.createAndCacheDerivedLabelmapImages>
  >
): void {
  segImages.forEach((segImage, sliceIndex) => {
    const { rows, columns } = segImage;
    const data = segImage.voxelManager.getScalarData() as Uint8Array;
    const cy = Math.floor(rows / 2);
    const cx1 = Math.floor(columns / 2) - 60;
    const r1 = 45 + sliceIndex * 2;
    const cx2 = Math.floor(columns / 2) + 80;
    const r2 = 25 + sliceIndex;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const dy = y - cy;
        const dx1 = x - cx1;
        const dx2 = x - cx2;

        if (dx1 * dx1 + dy * dy < r1 * r1) {
          data[y * columns + x] = 1;
        } else if (dx2 * dx2 + dy * dy < r2 * r2) {
          data[y * columns + x] = 2;
        }
      }
    }
  });
}

setTitleAndDescription(
  'Stack GenericViewport on the WebGPU render backend',
  'Renders an image stack through the experimental vtk.js WebGPU view API ' +
    '(registerRenderBackend id "webgpu"). Left click uses the tool selected ' +
    'in the dropdown (annotations included), middle click pans, right click ' +
    'zooms and the mouse wheel scrolls the stack. Use the backend buttons to ' +
    'live-switch between webgpu, gpu (WebGL) and cpu; the debug panel below ' +
    'shows the configured/effective backend, the render mode mounted on the ' +
    'viewport, and the WebGPU adapter once the device is initialized.'
);

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
    AngleTool,
    ProbeTool,
    RectangleROITool,
    EllipticalROITool,
    CircleROITool,
    BidirectionalTool,
    ArrowAnnotateTool,
    PlanarFreehandROITool,
    BrushTool,
    RectangleScissorsTool,
    CircleScissorsTool,
    PaintFillTool,
  ].forEach((tool) => cornerstoneTools.addTool(tool));

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName);

  // Segmentation editing tools: brush instances bound to strategies, plus
  // scissors and paint fill.
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

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';
// Tools examples disable the browser context menu on right click (zoom).
element.oncontextmenu = (e) => e.preventDefault();

content.appendChild(element);

const debugPanel = document.createElement('pre');
debugPanel.id = 'webgpu-backend-debug';
debugPanel.style.border = '1px solid #555';
debugPanel.style.padding = '8px';
debugPanel.style.marginTop = '8px';
debugPanel.style.maxWidth = '640px';
debugPanel.style.whiteSpace = 'pre-wrap';
debugPanel.innerText = 'initializing...';
content.appendChild(debugPanel);

function getViewport(): PlanarViewport | undefined {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  return renderingEngine?.getViewport<PlanarViewport>(viewportId);
}

function updateDebugPanel(): void {
  const viewport = getViewport();
  const lines: string[] = [];

  lines.push(`webgpu available: ${isWebGPURenderingAvailable()}`);
  lines.push(`configured backend: ${getRenderBackend()}`);
  lines.push(`effective backend: ${getEffectiveRenderBackend()}`);

  if (viewport) {
    const renderMode = viewport.getDisplaySetRenderMode?.(stackDataId);
    lines.push(`viewport render mode: ${renderMode ?? '(none mounted)'}`);
    lines.push(
      `image: ${viewport.getCurrentImageIdIndex() + 1}/${
        viewport.getImageIds().length
      }`
    );
  }

  const webgpuInfo = getWebGPUViewportDebugInfo(viewportId);

  if (webgpuInfo) {
    lines.push(
      `vtk.js view API: ${webgpuInfo.viewApi} (device ${
        webgpuInfo.initialized ? 'initialized' : 'initializing...'
      })`
    );
    if (webgpuInfo.adapter) {
      lines.push(`webgpu adapter: ${webgpuInfo.adapter}`);
    }
  } else {
    lines.push('vtk.js view API: WebGL (no WebGPU window for this viewport)');
  }

  debugPanel.innerText = lines.join('\n');
}

function switchBackend(backend: string): void {
  setRenderBackend(backend, 'example-toolbar');
  const viewport = getViewport();
  viewport?.render();
  updateDebugPanel();
}

// Annotation / manipulation tools on left click.
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

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    const viewport = getViewport();

    if (!viewport) {
      return;
    }

    const { invert = false } =
      viewport.getDisplaySetPresentation(stackDataId) || {};

    viewport.setDisplaySetPresentation(stackDataId, { invert: !invert });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Delete Annotations',
  onClick: () => {
    cornerstoneTools.annotation.state.removeAllAnnotations();
    getViewport()?.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    const viewport = getViewport();

    if (!viewport) {
      return;
    }

    viewport.resetViewState();
    viewport.setDisplaySetPresentation(stackDataId, {
      invert: false,
      voiRange: ctVoiRange,
    });
    viewport.render();
  },
});

element.addEventListener(Events.IMAGE_RENDERED, () => {
  updateDebugPanel();
});

eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, () => {
  updateDebugPanel();
});

async function run() {
  await initDemo();

  if (isWebGPURenderingAvailable()) {
    registerWebGPURenderBackend();
    setRenderBackend('webgpu', 'example-default');
  } else {
    debugPanel.innerText =
      'WebGPU is not available in this browser (navigator.gpu missing); falling back to the default backend.';
  }

  setUpToolGroup();

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
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  });

  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
  // Enough slices to exercise wheel scrolling. Note: with the webgpu backend
  // each newly shown slice currently allocates a fresh cached GPU texture
  // (the vtk.js device cache has no eviction yet).
  const stack = imageIds.slice(0, 20);

  utilities.genericViewportDisplaySetMetadataProvider.add(stackDataId, {
    imageIds: stack,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({
    displaySetId: stackDataId,
    options: {},
  });
  viewport.setDisplaySetPresentation(stackDataId, { voiRange: ctVoiRange });

  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  toolGroup.addViewport(viewportId, renderingEngineId);

  viewport.render();

  // Fake labelmap segmentation: derived per-slice labelmap images painted
  // with two segments, mounted as a labelmap representation overlay.
  const segImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(stack);
  paintFakeSegmentation(segImages);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segImages.map((image) => image.imageId),
        },
      },
    },
  ]);

  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  updateDebugPanel();
}

run();
