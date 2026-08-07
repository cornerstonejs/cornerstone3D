import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getConfiguration,
  getRenderingCapabilities,
} from '@cornerstonejs/core';
import {
  getBooleanUrlParam,
  getStringUrlParam,
} from '../../../../utils/demo/helpers/exampleParameters';
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
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
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
    'contour labelmap editing and AdvancedMagnify, on a sagittal volume ' +
    'viewport (top) and a stack viewport (bottom). Magnify runs on the ' +
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

// Volume depth cap. Touch devices get DEFAULT_MOBILE_MAX_SLICES so the CT plus
// its labelmap fits in mobile memory; an explicit ?maxSlices wins everywhere
// (including desktop) so the cap can be bisected from the device itself.
const DEFAULT_MOBILE_MAX_SLICES = 200;

function getMaxSlicesOverride(): number | null {
  const raw = getStringUrlParam('maxSlices');
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.warn('diag ignoring non-positive ?maxSlices:', raw);
    return null;
  }
  return parsed;
}

const maxSlicesOverride = getMaxSlicesOverride();

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
  Ctrl + left drag = zoom and Shift + left drag = pan, mirroring the 2- and 3-finger
  gestures so camera-vs-annotation behaviour can be compared on a desktop with no touch
  code involved.
  Magnify is only available on the stack viewport (bottom one).
  On phones the volume is capped to ${DEFAULT_MOBILE_MAX_SLICES} slices and rendered with half-precision textures to fit mobile GPU memory.
  `;

content.append(instructions);

// Device-side debugging aids. Presented as links rather than as parameters to
// type, because editing a URL on a tablet is painful and bisecting the slice
// cap is the fastest way to separate a host-allocation failure from a
// rendering one.
const diagnostics = document.createElement('p');
diagnostics.innerHTML = `
  <b>Blank viewport? Read this first.</b><br />
  Every viewport is painted by the single <code>renderingEngine.render()</code> at
  the very end of <code>run()</code>, so <i>both</i> viewports blank means setup threw
  before reaching it - it does not mean rendering failed. Open <b>Logs</b> (bottom
  right) and look for <code>diag FATAL:</code>, then note the last <code>diag</code>
  checkpoint that printed: that is where it died.
  <br /><br />
  <code>?maxSlices=N</code> caps the volume depth (default
  ${DEFAULT_MOBILE_MAX_SLICES} on touch devices, uncapped on desktop). Allocating the
  volume needs one contiguous host buffer of roughly rows x cols x N x 2 bytes, which
  is what fails first on a 2 GB tablet. If a low cap renders and a high one does not,
  the limit is host memory, not GPU texture memory:
  <a href="?maxSlices=4">maxSlices=4</a> &middot;
  <a href="?maxSlices=40">maxSlices=40</a> &middot;
  <a href="?maxSlices=200">maxSlices=200</a> &middot;
  <a href="?">reset</a>
  <br /><br />
  <b>Segmentation draws but the CT does not?</b> That is a texture-format problem, not
  a memory or rendering one: labelmaps are 8-bit and always work, while CT is 16-bit
  and needs a usable <code>norm16</code> (or half-float) format. Some GPUs advertise
  <code>EXT_texture_norm16</code> and render nothing through it, so compare
  <code>diag EXT_texture_norm16 (advertised)</code> against <code>norm16</code> and
  <code>norm16Linear</code> in <code>diag rendering capabilities</code> - a
  disagreement is the driver lying. <code>?psoa=1</code> forces half-precision
  textures and <code>?psoa=0</code> forces them off, overriding the automatic probe:
  <a href="?psoa=1">psoa=1</a> &middot;
  <a href="?psoa=0">psoa=0</a> &middot;
  <a href="?maxSlices=40&amp;psoa=1">maxSlices=40 + psoa=1</a>
  <br /><br />
  <b>Is it the pixels or the rendering?</b> <code>diag CT volume voxel range</code> and
  <code>diag stack image voxel range</code> report the decoded data. A uniform range
  means the pixels never arrived and no rendering setting will help.
  <code>?cpu=1</code> is the other half of that test - it bypasses WebGL textures
  entirely (and switches to V2 viewports automatically, since the legacy volume
  viewport cannot render on the CPU). If the CT appears on CPU but not on GPU, the
  data is fine and the texture path is at fault:
  <a href="?cpu=1&amp;maxSlices=40">cpu=1 + maxSlices=40</a>
  <br /><br />
  A <code>diag webglcontextlost</code> entry means the GPU process was killed
  (commonly out of memory). The canvas goes blank with no JavaScript error, so that
  log line is the only evidence.
`;

content.append(diagnostics);

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
      // Passive keeps existing annotations visible and editable.
      toolGroup.setToolPassive(previousToolName);
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

  // Ctrl/Shift + left drag mirror the 2- and 3-finger gestures on a mouse, so
  // "does the annotation drift while the camera moves?" can be answered on a
  // desktop with no touch code in the path at all. Modifier bindings win over
  // the plain-Primary selected tool because getActiveToolFor*Event requires
  // binding.modifierKey to equal the modifier actually held.
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Auxiliary },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Secondary },
      { numTouchPoints: 2 },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
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

// webglcontextlost does not bubble, so these listen in the capture phase on
// window: that reaches canvases the rendering engine creates later, without
// having to hunt them down after each viewport is enabled. A lost context
// blanks the canvas without throwing, so this is the only trace it leaves.
function describeCanvas(target: EventTarget | null): string {
  const canvas = target as HTMLCanvasElement | null;
  return (
    canvas?.id ||
    canvas?.parentElement?.id ||
    canvas?.closest?.('div[id]')?.id ||
    '(unidentified canvas)'
  );
}

window.addEventListener(
  'webglcontextlost',
  (evt) =>
    console.error(
      'diag webglcontextlost:',
      describeCanvas(evt.target),
      '- GPU context died (commonly out of memory); the canvas goes blank with no error.'
    ),
  true
);

window.addEventListener(
  'webglcontextrestored',
  (evt) =>
    console.log('diag webglcontextrestored:', describeCanvas(evt.target)),
  true
);

// These report what the driver *advertises*. Nothing may branch on them: an
// advertised extension can still render nothing, which is what
// getRenderingCapabilities() probes for. They are logged next to the validated
// profile so a lying driver is visible as a disagreement between the two.
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
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  console.log(
    'diag renderer:',
    dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
  );
  console.log(
    'diag EXT_texture_norm16 (advertised):',
    !!gl.getExtension('EXT_texture_norm16'),
    '- compare with norm16/norm16Linear in "diag rendering capabilities"; ' +
      'advertised-but-not-usable is a known Mali/Adreno failure mode'
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

/**
 * Reports the actual voxel range of decoded pixel data.
 *
 * This is the split between "the pixels never arrived" and "the pixels are
 * here but did not render". A uniform range means decoding or fetching failed
 * and no texture-format or memory setting will change anything - which is easy
 * to misdiagnose as a rendering bug, because a labelmap painted client-side
 * still draws correctly over an empty CT.
 */
function logVoxelRange(label: string, voxelManager): void {
  try {
    const range = voxelManager?.getMinMax?.();
    if (!range) {
      console.warn(`diag ${label} voxel range: no voxelManager available`);
      return;
    }
    const [min, max] = range;
    console.log(`diag ${label} voxel range:`, min, '..', max);
    if (min === max) {
      console.error(
        `diag ${label} IS UNIFORM (${min}) - decoded pixel data is empty. ` +
          'This is a decode/fetch failure, not a rendering one: texture ' +
          'format (?psoa) and slice count (?maxSlices) are irrelevant. ' +
          'Compare with ?cpu=1, which will also show nothing.'
      );
    }
  } catch (error) {
    console.error(
      `diag ${label} voxel range unavailable:`,
      (error as Error)?.message ?? String(error)
    );
  }
}
// ---------------------------------------------------------------------------

// Set in run() so the volume-loaded listener can inspect the decoded voxels.
let ctVolume;

async function run() {
  addLogConsoleButton();
  logWebGLDiagnostics();

  eventTarget.addEventListener(
    Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
    () => {
      console.log('diag volume loading completed');
      // Safe only now: on an image-backed volume the voxel accessors
      // dereference the per-slice images, which are not cached before this.
      logVoxelRange('CT volume', ctVolume?.voxelManager);
    }
  );

  // isMobile drops the engine to a single WebGL context - iOS silently
  // evicts pages holding several live contexts (the default pool is 7),
  // which blacks out the affected viewports with no console error.
  //
  // Half-precision volume textures (preferSizeOverAccuracy) where norm16 is
  // unusable; ?psoa=1 forces them and ?psoa=0 forces them off for debugging.
  // The gate reads core's getRenderingCapabilities() rather than the
  // getExtension() presence check in logWebGLDiagnostics: several GPUs (Mali
  // in particular) advertise EXT_texture_norm16 but render nothing through it,
  // so presence alone would leave 16-bit CT invisible while 8-bit labelmaps
  // still drew. norm16Linear matters as much as norm16 - the volume and stack
  // paths both sample with linear filtering.
  const caps = getRenderingCapabilities();
  const norm16Usable = caps.norm16 && caps.norm16Linear;
  const psoaParam = getStringUrlParam('psoa');
  const preferSizeOverAccuracy =
    psoaParam !== null ? getBooleanUrlParam('psoa') : !norm16Usable;

  console.log(
    'diag norm16 usable:',
    norm16Usable,
    '(norm16:',
    caps.norm16,
    'norm16Linear:',
    caps.norm16Linear,
    ') -> preferSizeOverAccuracy:',
    preferSizeOverAccuracy,
    psoaParam !== null ? '(forced by ?psoa)' : '(from capability probe)'
  );

  if (!norm16Usable && !caps.halfFloat) {
    console.error(
      'diag NEITHER norm16 nor halfFloat is usable on this GPU - 16-bit image ' +
        'data has no working texture format, so CT will not render even though ' +
        '8-bit labelmaps do.'
    );
  }

  // ?cpu=1 only sets useCPURendering, and the legacy volume viewport refuses
  // to render at all under it ("Volume viewports cannot be rendered whilst cpu
  // rendering is true"). The V2 (GenericViewport) volume path does support a
  // CPU backend - that is what the helper's planar.renderBackend: 'cpu' is
  // for - so opt into V2 automatically rather than making the CPU comparison
  // require remembering to add ?type=next as well.
  const cpuRendering = getBooleanUrlParam('cpu');
  if (cpuRendering) {
    console.log(
      'diag ?cpu=1 - enabling useGenericViewport so the volume viewport has a CPU path'
    );
  }

  await initDemo({
    core: {
      isMobile,
      rendering: {
        ...(preferSizeOverAccuracy ? { preferSizeOverAccuracy: true } : {}),
        ...(cpuRendering ? { useGenericViewport: true } : {}),
      },
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

  // Cap the volume depth so the CT (plus its labelmap) fits in mobile memory.
  // An explicit ?maxSlices applies on desktop too, so the cap can be bisected
  // from the device without rebuilding.
  const sliceCap =
    maxSlicesOverride ?? (isMobile ? DEFAULT_MOBILE_MAX_SLICES : null);
  if (sliceCap !== null && imageIds.length > sliceCap) {
    const start = Math.floor((imageIds.length - sliceCap) / 2);
    imageIds = imageIds.slice(start, start + sliceCap);
  }

  console.log(
    'diag slice cap:',
    sliceCap ?? 'none',
    maxSlicesOverride !== null ? '(from ?maxSlices)' : '(default)'
  );
  console.log('diag imageIds count (after mobile cap):', imageIds.length);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  ctVolume = volume;

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

  // The stack viewport decodes independently of the volume, so checking both
  // separates a decoder failure (neither has data) from a volume-pipeline one.
  logVoxelRange('stack image', stackViewport.getImageData()?.voxelManager);

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

// run() is a single sequential chain ending in the only renderingEngine.render()
// call, so anything that throws leaves every viewport black. Surface it as one
// obvious line instead of an [unhandledrejection] buried in the log.
run().catch((error) => {
  console.error(
    'diag FATAL: setup aborted before renderingEngine.render() -',
    (error as Error)?.message ?? String(error),
    (error as Error)?.stack ?? '(no stack)'
  );
});
