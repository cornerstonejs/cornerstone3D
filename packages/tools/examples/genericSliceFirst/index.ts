import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  ImageVolume,
  eventTarget,
  getConfiguration,
  getRenderingEngine,
  setSliceFirst,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  addToggleButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  ZoomTool,
  StackScrollTool,
  WindowLevelTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, OrientationAxis, BlendModes, InterpolationType, Events } =
  Enums;

const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'SLICE_FIRST_TOOL_GROUP';
const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const ctSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561';
const ptSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const ctVolumeId = `${volumeLoaderScheme}:SLICE_FIRST_CT`;
const ptVolumeId = `${volumeLoaderScheme}:SLICE_FIRST_PT`;
const ctDataId = 'slice-first:ct';
const ptDataId = 'slice-first:pt';
const ptVoiRange = { lower: 0, upper: 5 };
/**
 * The PT look of the fusion viewport: hsv over 0 to 5, clear at 0, faint for
 * low uptake so that the CT stays visible, and stronger for high uptake. The
 * values are parts of the VOI range.
 */
const ptColormap = {
  name: 'hsv',
  opacity: [
    { value: 0, opacity: 0 },
    { value: 0.1, opacity: 0.25 },
    { value: 0.5, opacity: 0.6 },
    { value: 1, opacity: 0.8 },
  ],
};
const defaultSlabThickness = 10;
const autoScrollMs = 10000;
const obliqueTilt = (25 * Math.PI) / 180;

type ViewportSpec = {
  viewportId: string;
  label: string;
  orientation:
    | Enums.OrientationAxis.AXIAL
    | Enums.OrientationAxis.SAGITTAL
    | Enums.OrientationAxis.CORONAL
    | Types.OrientationVectors;
  withPet: boolean;
};

const viewportSpecs: ViewportSpec[] = [
  {
    viewportId: 'CT_AXIAL',
    label: 'CT axial',
    orientation: OrientationAxis.AXIAL,
    withPet: false,
  },
  {
    viewportId: 'CT_SAGITTAL',
    label: 'CT sagittal',
    orientation: OrientationAxis.SAGITTAL,
    withPet: false,
  },
  {
    viewportId: 'FUSION_CORONAL',
    label: 'CT coronal + PT (slab)',
    orientation: OrientationAxis.CORONAL,
    withPet: true,
  },
  {
    viewportId: 'CT_OBLIQUE',
    label: 'CT oblique, 25 degrees',
    orientation: {
      viewPlaneNormal: [0, Math.sin(obliqueTilt), -Math.cos(obliqueTilt)],
      viewUp: [0, -Math.cos(obliqueTilt), -Math.sin(obliqueTilt)],
    },
    withPet: false,
  },
];
const viewportIds = viewportSpecs.map(({ viewportId }) => viewportId);
const coronalViewportId = 'FUSION_CORONAL';

const slabState = {
  thickness: 0,
  blendMode: 'off',
};

const blendModesByName = {
  off: BlendModes.COMPOSITE,
  mip: BlendModes.MAXIMUM_INTENSITY_BLEND,
  minip: BlendModes.MINIMUM_INTENSITY_BLEND,
  average: BlendModes.AVERAGE_INTENSITY_BLEND,
};

let lastAutoScrollLines = ['not run yet'];
let captionsScheduled = false;
let deviceLines: string[] | undefined;
const debugModalShown =
  new URLSearchParams(window.location.search).get('debug') !== 'false';
/** Below this window width the debug modal starts collapsed. */
const narrowWindowWidth = 700;

setTitleAndDescription(
  'Slice first',
  'Slice first cuts the slice you see out of the volume on the CPU and draws it as a flat 2D image. ' +
    'Volume texture puts the whole volume on the GPU as a 3D texture and cuts the slice there. ' +
    'Press the Rendering button and watch, in the debug panel, the MODE of each binding and the GPU memory line. ' +
    'A coronal slab always uses the volume texture, so that viewport shows vtkVolumeSlice and a 3D texture. ' +
    'Touch: one finger scrolls, two fingers zoom and move. ' +
    'Mouse: wheel scrolls, left drag sets window level, right drag zooms, middle drag moves. ' +
    'Add ?sliceFirst=0 to start with the volume texture, and ?debug=false to hide the debug panel.'
);

const style = document.createElement('style');
style.textContent = `
  #demo-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  #demo-toolbar button,
  #demo-toolbar select {
    min-height: 44px;
    min-width: 44px;
    padding: 0 14px;
    font-size: 16px;
  }
  #demo-toolbar label {
    font-size: 16px;
  }
  #demo-toolbar input[type='range'] {
    width: min(320px, 90vw);
    height: 44px;
  }
  .slice-first-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin: 8px 12px;
  }
  .slice-first-cell {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  body.beside-debug-modal #demo-title,
  body.beside-debug-modal #demo-description,
  body.beside-debug-modal #demo-toolbar,
  body.beside-debug-modal #content {
    max-width: max(360px, calc(100vw - 820px));
  }
  .slice-first-caption {
    font: 13px sans-serif;
    padding: 2px 0;
  }
  .slice-first-caption div {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slice-first-modes {
    font: 12px monospace;
    color: #555;
  }
  .slice-first-viewport {
    width: 100%;
    aspect-ratio: 1 / 1;
    max-height: 85vh;
    touch-action: none;
    background: #000;
  }
  .slice-first-status {
    font: 15px sans-serif;
    min-height: 1.5em;
    margin: 0 12px;
    white-space: pre-line;
  }
  .slice-first-report {
    width: calc(100% - 24px);
    height: 12em;
    margin: 8px 12px;
    font: 12px monospace;
  }
`;
document.head.appendChild(style);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.className = 'slice-first-grid';
document.body.classList.toggle(
  'beside-debug-modal',
  debugModalShown && window.innerWidth >= narrowWindowWidth
);
content.appendChild(viewportGrid);

const elementsByViewportId = new Map<string, HTMLDivElement>();
const modeCaptionsByViewportId = new Map<string, HTMLDivElement>();

viewportSpecs.forEach(({ viewportId, label }) => {
  const cell = document.createElement('div');
  const caption = document.createElement('div');
  const labelLine = document.createElement('div');
  const modesLine = document.createElement('div');
  const element = document.createElement('div');

  cell.className = 'slice-first-cell';
  caption.className = 'slice-first-caption';
  labelLine.innerText = label;
  modesLine.className = 'slice-first-modes';
  modesLine.innerText = 'loading';
  caption.appendChild(labelLine);
  caption.appendChild(modesLine);
  element.className = 'slice-first-viewport';
  element.oncontextmenu = (evt) => evt.preventDefault();
  cell.appendChild(caption);
  cell.appendChild(element);
  viewportGrid.appendChild(cell);
  elementsByViewportId.set(viewportId, element);
  modeCaptionsByViewportId.set(viewportId, modesLine);
});

const statusLine = document.createElement('div');
statusLine.className = 'slice-first-status';
content.appendChild(statusLine);

/** Returns the planar viewport with the given id, if it is mounted. */
function getViewport(viewportId: string): PlanarViewport | undefined {
  return getRenderingEngine(renderingEngineId)?.getViewport<PlanarViewport>(
    viewportId
  );
}

/** Returns the display set ids that a viewport of the given spec shows. */
function getDataIds(spec: ViewportSpec): string[] {
  return spec.withPet ? [ctDataId, ptDataId] : [ctDataId];
}

/** Names a volume of this example for the captions and the report. */
function getVolumeLabel(volumeId: string | undefined): string {
  if (volumeId === ctVolumeId) {
    return 'CT';
  }

  if (volumeId === ptVolumeId) {
    return 'PT';
  }

  return volumeId ?? 'unknown';
}

/**
 * Reads the WebGL facts of this device once, from a scratch WebGL2 context
 * that is released right after: the renderer string and the largest 2D and 3D
 * texture sizes. A device without WebGL2 tries WebGL1 for the 2D size.
 */
function readDeviceLines(): string[] {
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2');
  const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
    gl2 ?? canvas.getContext('webgl');

  if (!gl) {
    return ['WebGL: not available on this device'];
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const max2D = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const max3D = gl2 ? gl2.getParameter(gl2.MAX_3D_TEXTURE_SIZE) : 'no WebGL2';

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return [
    `WebGL: ${gl2 ? 'WebGL2' : 'WebGL1 only'}`,
    `WebGL renderer: ${renderer}`,
    `Largest 2D texture: ${max2D}`,
    `Largest 3D texture: ${max3D}`,
  ];
}

type SliceCacheStatistics = {
  hits: number;
  misses: number;
  prefetched: number;
  size?: number;
  lastSampleMs?: number;
  lastFineSampleMs?: number;
};

type ImageDataLike = {
  getDimensions?: () => number[];
  getPointData?: () => {
    getScalars?: () => {
      getData?: () => { BYTES_PER_ELEMENT?: number };
      getNumberOfComponents?: () => number;
    } | null;
  } | null;
};

type DebugBinding = {
  displaySetId: string;
  rendering?: {
    renderMode?: string;
    mapper?: { getInputData?: () => ImageDataLike | null };
    getSliceCacheStatistics?: () => SliceCacheStatistics;
  };
};

/**
 * Reads the display sets of a viewport with their mounted renderings, from
 * the internal accessor that the debug modal also reads. Returns an empty
 * list when the viewport has none, and never throws.
 */
function readDebugBindings(viewport: PlanarViewport): DebugBinding[] {
  try {
    const { getDebugBindings } = viewport as unknown as {
      getDebugBindings?: () => DebugBinding[];
    };

    return getDebugBindings?.call(viewport) ?? [];
  } catch {
    return [];
  }
}

/** Formats milliseconds for the report. */
function formatMs(value: number | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(1)} ms` : 'n/a';
}

/** Formats bytes as MB with two decimals. */
function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Names the display sets of a viewport with their render mode, as "CT vtkSampledSlice". */
function describeModes(viewport: PlanarViewport): string {
  return viewport
    .getActors()
    .map(
      (entry) =>
        `${getVolumeLabel(entry.referencedId)} ${entry.actorMapper?.renderMode ?? 'unknown'}`
    )
    .join(', ');
}

/**
 * Returns the bytes of the 2D texture of a display set drawn by an image
 * mapper: width x height x bytes of one value of the uploaded array, or 0.
 */
function getSliceTextureBytes(binding: DebugBinding): number {
  const imageData = binding.rendering?.mapper?.getInputData?.();
  const [width = 0, height = 0] = imageData?.getDimensions?.() ?? [];
  const scalars = imageData?.getPointData?.()?.getScalars?.();
  const bytesPerValue = scalars?.getData?.()?.BYTES_PER_ELEMENT ?? 0;

  return (
    width * height * bytesPerValue * (scalars?.getNumberOfComponents?.() ?? 1)
  );
}

/** Describes one display set of a sampled viewport: slice size, sample times and cache counts. */
function describeSampling(binding: DebugBinding): string | undefined {
  const statistics = binding.rendering?.getSliceCacheStatistics?.();

  if (!statistics) {
    return undefined;
  }

  const label = binding.displaySetId === ptDataId ? 'PT' : 'CT';
  const [width, height] =
    binding.rendering?.mapper?.getInputData?.()?.getDimensions?.() ?? [];
  const slice = width ? `slice ${width}x${height}, ` : '';

  return (
    `  ${label} ${slice}sample ${formatMs(statistics.lastSampleMs)}, ` +
    `fine ${formatMs(statistics.lastFineSampleMs)}, ` +
    `cache ${statistics.size ?? 0} held, ${statistics.hits} hits, ` +
    `${statistics.misses} misses, ${statistics.prefetched} prefetched`
  );
}

/** Describes one viewport: render modes, slice index, canvas size, then one line per sampled display set. */
function describeViewport(spec: ViewportSpec): string[] {
  const viewport = getViewport(spec.viewportId);

  if (!viewport) {
    return [`${spec.viewportId}: not mounted`];
  }

  const canvas = viewport.getCanvas();
  const slice = `${viewport.getSliceIndex() + 1}/${viewport.getNumberOfSlices()}`;
  const sampling = readDebugBindings(viewport)
    .map(describeSampling)
    .filter(Boolean);

  return [
    `${spec.viewportId}: ${describeModes(viewport)} | slice ${slice} | canvas ${canvas.width}x${canvas.height}`,
    ...sampling,
  ];
}

/** Sums the 2D slice textures of every display set of every viewport. */
function getSliceTextureTotal(): number {
  let total = 0;

  for (const viewportId of viewportIds) {
    const viewport = getViewport(viewportId);

    if (viewport) {
      for (const binding of readDebugBindings(viewport)) {
        total += getSliceTextureBytes(binding);
      }
    }
  }

  return total;
}

/** Builds the report as plain text, for the clipboard. */
function buildReport(): string {
  deviceLines ??= readDeviceLines();

  const sliceFirst = getConfiguration().rendering?.planar?.sliceFirst ?? false;

  return [
    `Slice first: ${sliceFirst ? 'on' : 'off'}`,
    `Coronal slab: ${slabState.blendMode} ${slabState.thickness} mm`,
    ...viewportSpecs.flatMap(describeViewport),
    `GPU memory: 3D volume textures ${formatMegabytes(ImageVolume.textureBytesUsed)}, ` +
      `2D slice textures about ${formatMegabytes(getSliceTextureTotal())}`,
    `Device pixel ratio: ${window.devicePixelRatio}`,
    `Window size: ${window.innerWidth}x${window.innerHeight}`,
    ...deviceLines,
    'Auto scroll:',
    ...lastAutoScrollLines,
  ].join('\n');
}

/** Shows the render mode of the display sets of each viewport in its caption. */
function updateCaptions(): void {
  for (const viewportId of viewportIds) {
    const viewport = getViewport(viewportId);
    const caption = modeCaptionsByViewportId.get(viewportId);
    const text = viewport
      ? describeModes(viewport) || 'no data'
      : 'not mounted';

    if (caption && caption.innerText !== text) {
      caption.innerText = text;
    }
  }
}

/** Updates the captions on the next animation frame, at most once per frame. */
function scheduleCaptions(): void {
  if (captionsScheduled) {
    return;
  }

  captionsScheduled = true;
  requestAnimationFrame(() => {
    captionsScheduled = false;
    updateCaptions();
  });
}

/** Applies the slab state to both display sets of the coronal viewport. */
function applySlab(): void {
  const viewport = getViewport(coronalViewportId);

  if (!viewport) {
    return;
  }

  const isOff = slabState.blendMode === 'off';

  for (const dataId of [ctDataId, ptDataId]) {
    viewport.setDisplaySetPresentation(dataId, {
      blendMode: blendModesByName[slabState.blendMode],
      slabThickness: isOff ? 0 : slabState.thickness,
    });
  }

  viewport.render();
  scheduleCaptions();
}

/** Shows the slab thickness in the label of the slider, or "off". */
function setSlabLabel(): void {
  const label = document.getElementById('slab-thickness-label');

  if (label) {
    label.innerText =
      slabState.blendMode === 'off'
        ? 'Slab thickness: off'
        : `Slab thickness: ${slabState.thickness} mm`;
  }
}

/**
 * Sets the slab type. The thickness slider is disabled while the slab is off,
 * and starts at the default thickness when a slab is turned on with the
 * slider at 0.
 */
function setSlabBlendMode(blendMode: string): void {
  const slider = document.getElementById(
    'slab-thickness'
  ) as HTMLInputElement | null;
  const wasOff = slabState.blendMode === 'off';

  slabState.blendMode = blendMode;

  if (wasOff && blendMode !== 'off' && slabState.thickness === 0) {
    slabState.thickness = defaultSlabThickness;
  }

  if (slider) {
    slider.disabled = blendMode === 'off';
    slider.value = String(slabState.thickness);
  }

  setSlabLabel();
  applySlab();
}

/** Sets the interpolation of every display set in every viewport. */
function applyInterpolation(name: string): void {
  const interpolationType =
    name === 'nearest' ? InterpolationType.NEAREST : InterpolationType.LINEAR;

  for (const spec of viewportSpecs) {
    const viewport = getViewport(spec.viewportId);

    if (!viewport) {
      continue;
    }

    for (const dataId of getDataIds(spec)) {
      viewport.setDisplaySetPresentation(dataId, { interpolationType });
    }

    viewport.render();
  }

  scheduleCaptions();
}

/** Resolves on the next render of the element, or after a short wait. */
function waitForRender(element: HTMLDivElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, 200);

    function done() {
      window.clearTimeout(timer);
      element.removeEventListener(Events.IMAGE_RENDERED, done);
      resolve();
    }

    element.addEventListener(Events.IMAGE_RENDERED, done);
  });
}

type AutoScrollResult = {
  frames: number;
  /** Milliseconds of each call that changed the slice. */
  stepMs: number[];
};

/**
 * Scrolls one viewport one slice at a time until the end time, waiting for
 * each slice to be drawn, and turns around at either end of the volume.
 * Returns the number of frames drawn and the time of each scroll call.
 */
async function autoScrollViewport(
  viewportId: string,
  endTime: number
): Promise<AutoScrollResult> {
  const viewport = getViewport(viewportId);
  const element = elementsByViewportId.get(viewportId);
  const stepMs: number[] = [];
  let direction = 1;
  let frames = 0;

  if (!viewport || !element) {
    return { frames: 0, stepMs };
  }

  const countFrame = () => {
    frames += 1;
  };

  element.addEventListener(Events.IMAGE_RENDERED, countFrame);

  while (performance.now() < endTime) {
    const next = viewport.getSliceIndex() + direction;

    if (next < 0 || next >= viewport.getNumberOfSlices()) {
      direction = -direction;
    }

    const rendered = waitForRender(element);
    const stepStart = performance.now();

    await viewport.scroll(direction);
    stepMs.push(performance.now() - stepStart);
    await rendered;
  }

  element.removeEventListener(Events.IMAGE_RENDERED, countFrame);

  return { frames, stepMs };
}

/** Returns the median of a list of numbers, or undefined for an empty list. */
function getMedian(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Plays the automatic scroll in all viewports and reports frames per second. */
async function playAutoScroll(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  statusLine.innerText = 'Scrolling all viewports for 10 seconds...';

  const startTime = performance.now();
  const endTime = startTime + autoScrollMs;
  const results = await Promise.all(
    viewportIds.map((viewportId) => autoScrollViewport(viewportId, endTime))
  );
  const seconds = (performance.now() - startTime) / 1000;

  lastAutoScrollLines = viewportIds.map((viewportId, index) => {
    const { frames, stepMs } = results[index];
    const worstMs = stepMs.length ? Math.max(...stepMs) : undefined;

    return (
      `${viewportId}: ${(frames / seconds).toFixed(1)} frames per second, ` +
      `scroll step median ${formatMs(getMedian(stepMs))}, worst ${formatMs(worstMs)}`
    );
  });

  const allStepMs = results.flatMap(({ stepMs }) => stepMs);
  const framesPerSecond = results
    .map(({ frames }) => (frames / seconds).toFixed(0))
    .join(', ');

  statusLine.innerText =
    `Auto scroll: ${framesPerSecond} frames per second (${viewportIds.length} viewports).\n` +
    `Scroll step median ${formatMs(getMedian(allStepMs))}, worst ${formatMs(
      allStepMs.length ? Math.max(...allStepMs) : undefined
    )}. Copy report for details.`;
  button.disabled = false;
  scheduleCaptions();
}

/**
 * Copies text with the older copy command, through a hidden text area.
 * Returns false when the browser refuses.
 */
function copyWithTextArea(text: string): boolean {
  const area = document.createElement('textarea');

  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Shows the report in a selected text area under the status line, for a
 * browser that allows no copy, so it can be copied by hand.
 */
function showReportForHandCopy(text: string): void {
  let area = document.getElementById(
    'slice-first-report'
  ) as HTMLTextAreaElement | null;

  if (!area) {
    area = document.createElement('textarea');
    area.id = 'slice-first-report';
    area.className = 'slice-first-report';
    area.readOnly = true;
    statusLine.after(area);
  }

  area.value = text;
  area.select();
}

/**
 * Puts the report on the clipboard. The clipboard API needs a secure page,
 * which a phone on plain http is not, so the fallback tries the older copy
 * command, and then shows the report to copy by hand.
 */
async function copyReport(): Promise<void> {
  const text = buildReport();
  let copied = false;

  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = copyWithTextArea(text);
  }

  if (copied) {
    statusLine.innerText = 'Report copied. Paste it in your message.';

    return;
  }

  showReportForHandCopy(text);
  statusLine.innerText =
    'The browser does not allow copying here. The report is selected below: copy it by hand.';
}

/** Adds the tools: touch and mouse bindings for scroll, window level, zoom and pan. */
function setupTools(): void {
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName, { pinchToZoom: true, pan: true });
  toolGroup.addTool(PanTool.toolName);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }, { numTouchPoints: 1 }],
  });
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }, { numTouchPoints: 2 }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });

  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );
}

/** The title of the rendering button for slice first on or off. */
function getRenderingTitle(sliceFirst: boolean): string {
  return sliceFirst ? 'Rendering: slice first' : 'Rendering: volume texture';
}

/** Adds the controls, after init so that the slice first button shows the starting value. */
function setupControls(): void {
  const sliceFirstOn =
    getConfiguration().rendering?.planar?.sliceFirst ?? false;
  const sliceFirstButton = addToggleButtonToToolbar({
    id: 'slice-first-toggle',
    title: getRenderingTitle(sliceFirstOn),
    defaultToggle: sliceFirstOn,
    onClick: (enabled) => {
      setSliceFirst(enabled);
      sliceFirstButton.innerHTML = getRenderingTitle(enabled);
      scheduleCaptions();
    },
  });

  addDropdownToToolbar({
    id: 'slab-blend-mode',
    labelText: 'Coronal slab',
    options: {
      values: ['off', 'mip', 'minip', 'average'],
      labels: ['Off', 'MIP', 'MinIP', 'Average'],
      defaultValue: 'off',
    },
    onSelectedValueChange: (value) => setSlabBlendMode(String(value)),
  });

  addSliderToToolbar({
    id: 'slab-thickness',
    title: 'Slab thickness: off',
    range: [0, 300],
    step: 1,
    defaultValue: 0,
    onSelectedValueChange: (value) => {
      slabState.thickness = Number(value);
      applySlab();
    },
    updateLabelOnChange: () => setSlabLabel(),
  });

  (document.getElementById('slab-thickness') as HTMLInputElement).disabled =
    true;

  addDropdownToToolbar({
    id: 'interpolation',
    labelText: 'Interpolation',
    options: {
      values: ['linear', 'nearest'],
      labels: ['Linear', 'Nearest'],
      defaultValue: 'linear',
    },
    onSelectedValueChange: (value) => applyInterpolation(String(value)),
  });

  const playButton = addButtonToToolbar({
    id: 'auto-scroll',
    title: 'Auto scroll 10 s',
    onClick: () => {
      void playAutoScroll(playButton);
    },
  });

  addButtonToToolbar({
    id: 'copy-report',
    title: 'Copy report',
    onClick: () => {
      void copyReport();
    },
  });
}

/** Mounts the display sets of one viewport and sets their look. */
async function mountViewport(spec: ViewportSpec): Promise<void> {
  const viewport = getViewport(spec.viewportId);
  const options = { orientation: spec.orientation };

  await viewport.setDisplaySets(
    ...getDataIds(spec).map((displaySetId) => ({ displaySetId, options }))
  );

  viewport.setDisplaySetPresentation(ctDataId, { voiRange: ctVoiRange });

  if (spec.withPet) {
    viewport.setDisplaySetPresentation(ptDataId, {
      voiRange: ptVoiRange,
      colormap: ptColormap,
    });
  }
}

/**
 * Starts the example: slice first and the debug modal are on unless the
 * address says `sliceFirst=0` or `debug=false`, which initDemo applies over
 * this config.
 */
async function run() {
  await initDemo({
    core: {
      rendering: { planar: { sliceFirst: true } },
      debug: { statsOverlay: true },
    },
  });

  setupControls();

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

  renderingEngine.setViewports(
    viewportSpecs.map(({ viewportId, orientation }) => ({
      viewportId,
      type: ViewportType.PLANAR,
      element: elementsByViewportId.get(viewportId),
      defaultOptions: {
        orientation,
        background: [0, 0, 0] as Types.Point3,
      },
    }))
  );

  setupTools();

  const [ctVolume, ptVolume] = await Promise.all([
    volumeLoader.createAndCacheVolume(ctVolumeId, { imageIds: ctImageIds }),
    volumeLoader.createAndCacheVolume(ptVolumeId, { imageIds: ptImageIds }),
  ]);

  ctVolume.load();
  ptVolume.load();

  utilities.genericViewportDisplaySetMetadataProvider.add(ctDataId, {
    kind: 'planar',
    imageIds: ctImageIds,
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
    volumeId: ctVolumeId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptDataId, {
    kind: 'planar',
    imageIds: ptImageIds,
    initialImageIdIndex: Math.floor(ptImageIds.length / 2),
    volumeId: ptVolumeId,
  });

  await Promise.all(viewportSpecs.map(mountViewport));

  elementsByViewportId.forEach((element) =>
    element.addEventListener(Events.IMAGE_RENDERED, scheduleCaptions)
  );
  eventTarget.addEventListener(
    Events.RENDERING_PIPELINE_CHANGED,
    scheduleCaptions
  );

  new ResizeObserver(() => {
    renderingEngine.resize(true, false);
    scheduleCaptions();
  }).observe(viewportGrid);

  renderingEngine.renderViewports(viewportIds);
  scheduleCaptions();
}

run();
