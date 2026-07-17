import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getConfiguration,
  getRenderingCapabilities,
} from '@cornerstonejs/core';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  addSliderToToolbar,
  addButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import addSegmentIndexDropdown from '../../../../utils/demo/helpers/addSegmentIndexDropdown';
import { eventTarget } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  annotation,
  utilities: cstUtils,
  // Manipulation
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  PlanarRotateTool,
  WindowLevelRegionTool,
  VolumeRotateTool,
  MagnifyTool,
  AdvancedMagnifyTool,
  // Measurement / annotation
  LengthTool,
  BidirectionalTool,
  ArrowAnnotateTool,
  AngleTool,
  CobbAngleTool,
  EllipticalROITool,
  CircleROITool,
  RectangleROITool,
  ProbeTool,
  DragProbeTool,
  PlanarFreehandROITool,
  SplineROITool,
  LivewireContourTool,
  SculptorTool,
  // Segmentation
  BrushTool,
  RectangleScissorsTool,
  CircleScissorsTool,
  SphereScissorsTool,
  PaintFillTool,
  LabelMapEditWithContourTool,
  // Reference
  CrosshairsTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const segmentationId = 'TOUCH_SEGMENTATION_ID';
const volumeToolGroupId = 'VOLUME_TOOLGROUP_ID';
const stackToolGroupId = 'STACK_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const viewportIdSagittal = 'CT_SAGITTAL';
const viewportIdStack = 'CT_STACK';

setTitleAndDescription(
  'Touch: All Tools',
  'One page to exercise the touch interaction surface on a phone or tablet: ' +
    'manipulation, all measurement tools, labelmap brushing/scissors/fill, ' +
    'contour labelmap editing, click-to-segment, AdvancedMagnify and ' +
    'Crosshairs (linking the two volume viewports). Magnify runs on the ' +
    'stack viewport only. No app-level touch-action is set here - the ' +
    'rendering engine now applies it to viewport elements itself.'
);

// Two rows: sagittal volume viewport on top, stack viewport below, each
// near full width on a phone and capped for desktop.
const size = 'min(94vw, 512px)';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'column';
viewportGrid.style.gap = '2px';

const elementSagittal = document.createElement('div');
const elementStack = document.createElement('div');

[elementSagittal, elementStack].forEach((element) => {
  element.style.width = size;
  element.style.height = size;
  element.style.flexShrink = '0';
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
});

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Touch gestures:
  - 1-finger drag: the selected tool (dropdown above)
  - 2-finger pinch: zoom (also pans with the pinch midpoint)
  - 3-finger drag: scroll slices
  - Spline/Livewire: tap to place points; double-tap to close
  - AdvancedMagnify: tap places the loupe; long-press the loupe for zoom factors
  - Probe/DragProbe: the readout renders offset above the finger

  Mouse still works everywhere: left = selected tool, middle = pan, right = zoom, wheel = scroll.
  Magnify is only available on the stack viewport (bottom one).
  On phones the volume is capped to 200 slices and rendered with half-precision textures to fit mobile GPU memory.
  `;

content.append(instructions);

const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  CircularEraser: 'CircularEraser',
  SphereBrush: 'SphereBrush',
  ThresholdCircularBrush: 'ThresholdCircularBrush',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.ThresholdCircularBrush]: 'THRESHOLD_INSIDE_CIRCLE',
};

// Tools selectable onto Primary (and therefore 1-finger touch). Order matters
// only for the dropdown display.
const selectableToolNames = [
  // Manipulation
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  StackScrollTool.toolName,
  PlanarRotateTool.toolName,
  WindowLevelRegionTool.toolName,
  VolumeRotateTool.toolName,
  MagnifyTool.toolName,
  AdvancedMagnifyTool.toolName,
  // Measurement
  LengthTool.toolName,
  BidirectionalTool.toolName,
  ArrowAnnotateTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  RectangleROITool.toolName,
  ProbeTool.toolName,
  DragProbeTool.toolName,
  PlanarFreehandROITool.toolName,
  SplineROITool.toolName,
  LivewireContourTool.toolName,
  SculptorTool.toolName,
  // Segmentation
  brushInstanceNames.CircularBrush,
  brushInstanceNames.CircularEraser,
  brushInstanceNames.SphereBrush,
  brushInstanceNames.ThresholdCircularBrush,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  SphereScissorsTool.toolName,
  PaintFillTool.toolName,
  LabelMapEditWithContourTool.toolName,
];

function setSelectedTool(toolName: string) {
  [volumeToolGroupId, stackToolGroupId].forEach((toolGroupId) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    if (!toolGroup.hasTool(toolName)) {
      return;
    }

    const previousToolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (previousToolName === toolName) {
      return;
    }

    if (previousToolName) {
      // Passive keeps existing annotations visible and editable; Crosshairs
      // renders its gizmo even when passive, so it is fully disabled instead.
      if (previousToolName === CrosshairsTool.toolName) {
        toolGroup.setToolDisabled(previousToolName);
      } else {
        toolGroup.setToolPassive(previousToolName);
      }
    }

    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  });
}

addDropdownToToolbar({
  labelText: 'Tool (1-finger / left click)',
  options: {
    values: selectableToolNames,
    defaultValue: WindowLevelTool.toolName,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    setSelectedTool(String(nameAsStringOrNumber));
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(volumeToolGroupId, value);
  },
});

addSegmentIndexDropdown(segmentationId);

addButtonToToolbar({
  title: 'Reset Cameras',
  onClick: () => {
    const renderingEngine = window.renderingEngine as RenderingEngine;
    [viewportIdSagittal, viewportIdStack].forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.resetCamera();
      viewport.render();
    });
  },
});

addButtonToToolbar({
  title: 'Clear Annotations',
  onClick: () => {
    annotation.state.removeAllAnnotations();
    (window.renderingEngine as RenderingEngine).render();
  },
});

function addToolsToGroup(toolGroup, { isVolumeGroup }: { isVolumeGroup }) {
  // Always-on manipulation bindings matching OHIF's standard touch surface
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }, { numTouchPoints: 2 }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }, { numTouchPoints: 3 }],
  });

  // Selectable manipulation tools
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PlanarRotateTool.toolName);
  toolGroup.addTool(WindowLevelRegionTool.toolName);
  toolGroup.addTool(AdvancedMagnifyTool.toolName);

  // Measurement tools
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(DragProbeTool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(SplineROITool.toolName);
  toolGroup.addTool(LivewireContourTool.toolName);
  toolGroup.addTool(SculptorTool.toolName);

  if (isVolumeGroup) {
    toolGroup.addTool(VolumeRotateTool.toolName);

    // Labelmap editing tools
    Object.entries(brushInstanceNames).forEach(([name]) => {
      toolGroup.addToolInstance(name, BrushTool.toolName, {
        activeStrategy: brushStrategies[name],
        ...(name === brushInstanceNames.ThresholdCircularBrush
          ? {
              threshold: {
                range: [200, 1000] as Types.Point2, // CT bone
                isDynamic: false,
                dynamicRadius: 0,
              },
            }
          : {}),
      });
    });
    toolGroup.addTool(RectangleScissorsTool.toolName);
    toolGroup.addTool(CircleScissorsTool.toolName);
    toolGroup.addTool(SphereScissorsTool.toolName);
    toolGroup.addTool(PaintFillTool.toolName);
    toolGroup.addTool(LabelMapEditWithContourTool.toolName);
  } else {
    // Magnify is stack-viewport-only (it throws on volume viewports)
    toolGroup.addTool(MagnifyTool.toolName);
  }

  // Every selectable tool starts passive (annotations stay editable and
  // tool groups always have toolOptions for each tool, matching how modes
  // set up their groups); the selected tool is then activated onto Primary.
  selectableToolNames.forEach((toolName) => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
}

// Same coarse-pointer check the other examples use for mobile-specific setup
const isMobile = window.matchMedia('(any-pointer:coarse)').matches;

// ---- On-page log console -------------------------------------------------
// Device debugging without a tethered inspector: captures console output,
// uncaught errors and a WebGL capability report; the Logs button shows a
// copyable textarea.
const logEntries: string[] = [];

function captureLog(level: string, args: unknown[]) {
  const text = args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack ?? ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  logEntries.push(`[${level}] ${text}`);
  if (logEntries.length > 400) {
    logEntries.shift();
  }
}

(['log', 'info', 'warn', 'error'] as const).forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    captureLog(level, args);
    original(...args);
  };
});
window.addEventListener('error', (e) =>
  captureLog('uncaught', [
    e.message,
    `${e.filename}:${e.lineno}`,
    e.error?.stack ?? '(no stack)',
  ])
);
window.addEventListener('unhandledrejection', (e) =>
  captureLog('unhandledrejection', [
    e.reason,
    (e.reason as Error)?.stack ?? '(no stack)',
  ])
);

const glCaps = { webgl2: false, norm16: false };

function logWebGLDiagnostics() {
  console.log('diag userAgent:', navigator.userAgent);
  console.log('diag devicePixelRatio:', window.devicePixelRatio);
  console.log('diag isMobile (any-pointer:coarse):', isMobile);

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    console.error('diag webgl2: NOT AVAILABLE');
    return;
  }
  glCaps.webgl2 = true;
  glCaps.norm16 = !!gl.getExtension('EXT_texture_norm16');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  console.log(
    'diag renderer:',
    dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
  );
  console.log(
    'diag EXT_texture_norm16:',
    !!gl.getExtension('EXT_texture_norm16')
  );
  console.log(
    'diag EXT_color_buffer_float:',
    !!gl.getExtension('EXT_color_buffer_float'),
    'EXT_color_buffer_half_float:',
    !!gl.getExtension('EXT_color_buffer_half_float'),
    'OES_texture_float_linear:',
    !!gl.getExtension('OES_texture_float_linear')
  );
  console.log(
    'diag MAX_3D_TEXTURE_SIZE:',
    gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
    'MAX_TEXTURE_SIZE:',
    gl.getParameter(gl.MAX_TEXTURE_SIZE)
  );
  // Free the probe context; iOS caps live WebGL contexts aggressively
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

function addLogConsoleButton() {
  const overlay = document.createElement('textarea');
  overlay.readOnly = true;
  overlay.style.cssText =
    'position:fixed;left:2vw;bottom:60px;width:96vw;height:45vh;z-index:1000;' +
    'display:none;font-size:11px;background:#111;color:#eee;';

  const button = document.createElement('button');
  button.innerText = 'Logs';
  button.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:1001;padding:8px 14px;';
  button.onclick = () => {
    const visible = overlay.style.display !== 'none';
    overlay.style.display = visible ? 'none' : 'block';
    if (!visible) {
      overlay.value = logEntries.join('\n');
      overlay.scrollTop = overlay.scrollHeight;
    }
  };

  const copyButton = document.createElement('button');
  copyButton.innerText = 'Copy';
  copyButton.style.cssText =
    'position:fixed;right:88px;bottom:8px;z-index:1001;padding:8px 14px;';
  copyButton.onclick = () => {
    overlay.style.display = 'block';
    overlay.value = logEntries.join('\n');
    overlay.select();
    // clipboard API needs a secure context; LAN http is not one
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(overlay.value);
    } else {
      document.execCommand('copy');
    }
  };

  document.body.append(overlay, button, copyButton);
}
// ---------------------------------------------------------------------------

async function run() {
  addLogConsoleButton();
  logWebGLDiagnostics();

  eventTarget.addEventListener(
    Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
    () => console.log('diag volume loading completed')
  );

  // isMobile drops the engine to a single WebGL context - iOS silently
  // evicts pages holding several live contexts (the default pool is 7),
  // which blacks out the affected viewports with no console error.
  // Half-precision volume textures (preferSizeOverAccuracy) only where
  // norm16 is actually missing; ?psoa=1 forces them for debugging.
  await initDemo({
    core: {
      isMobile,
      rendering:
        getBooleanUrlParam('psoa') || (isMobile && !glCaps.norm16)
          ? { preferSizeOverAccuracy: true }
          : {},
    },
  });

  console.log(
    'diag rendering config:',
    JSON.stringify(getConfiguration().rendering)
  );
  console.log(
    'diag rendering capabilities:',
    JSON.stringify(getRenderingCapabilities())
  );

  const toolClasses = [
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollTool,
    PlanarRotateTool,
    WindowLevelRegionTool,
    VolumeRotateTool,
    MagnifyTool,
    AdvancedMagnifyTool,
    LengthTool,
    BidirectionalTool,
    ArrowAnnotateTool,
    AngleTool,
    CobbAngleTool,
    EllipticalROITool,
    CircleROITool,
    RectangleROITool,
    ProbeTool,
    DragProbeTool,
    PlanarFreehandROITool,
    SplineROITool,
    LivewireContourTool,
    SculptorTool,
    BrushTool,
    RectangleScissorsTool,
    CircleScissorsTool,
    SphereScissorsTool,
    PaintFillTool,
    LabelMapEditWithContourTool,
    CrosshairsTool,
  ];

  toolClasses.forEach((toolClass) => cornerstoneTools.addTool(toolClass));

  const volumeToolGroup = ToolGroupManager.createToolGroup(volumeToolGroupId);
  const stackToolGroup = ToolGroupManager.createToolGroup(stackToolGroupId);

  addToolsToGroup(volumeToolGroup, { isVolumeGroup: true });
  addToolsToGroup(stackToolGroup, { isVolumeGroup: false });

  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Cap the volume depth on phones so the CT (plus its labelmap) fits in
  // mobile GPU memory; desktop loads the full series.
  const mobileMaxSlices = 200;
  if (isMobile && imageIds.length > mobileMaxSlices) {
    const start = Math.floor((imageIds.length - mobileMaxSlices) / 2);
    imageIds = imageIds.slice(start, start + mobileMaxSlices);
  }

  console.log('diag imageIds count (after mobile cap):', imageIds.length);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Note: do NOT read volume.sizeInBytes here - on an image-backed volume it
  // dereferences slice 0's image, which is not cached yet, and the throw
  // (VoxelManager.bytePerVoxel on null) aborts the rest of the setup.
  console.log('diag volume dimensions:', volume.dimensions);

  const renderingEngine = new RenderingEngine(renderingEngineId);
  (window as { renderingEngine? }).renderingEngine = renderingEngine;

  renderingEngine.setViewports([
    {
      viewportId: viewportIdSagittal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementSagittal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIdStack,
      type: ViewportType.STACK,
      element: elementStack,
      defaultOptions: {
        background: [0, 0, 0] as Types.Point3,
      },
    },
  ]);

  volumeToolGroup.addViewport(viewportIdSagittal, renderingEngineId);
  stackToolGroup.addViewport(viewportIdStack, renderingEngineId);

  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportIdSagittal]
  );

  const stackViewport = renderingEngine.getViewport(
    viewportIdStack
  ) as Types.IStackViewport;
  await stackViewport.setStack(imageIds, Math.floor(imageIds.length / 2));
  stackViewport.setProperties({ voiRange: ctVoiRange });

  // Labelmap segmentation for the brush/scissors/fill/contour-edit tools
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
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
  await segmentation.addSegmentationRepresentations(viewportIdSagittal, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  renderingEngine.render();
}

run();
