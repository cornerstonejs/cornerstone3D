import { vec3 } from 'gl-matrix';
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
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import { getStringUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events, OrientationAxis, BlendModes } = Enums;

const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:PT_VOLUME_ID`;
const mipDataId = 'webgpu-pet-mip:planar';
const mipViewportId = 'PT_MIP_PLANAR';
const MIP_ROTATION_STEP_DEGREES = 6;

const BLEND_MODE_OPTIONS: Record<string, Enums.BlendModes> = {
  'Maximum Intensity': BlendModes.MAXIMUM_INTENSITY_BLEND,
  'Minimum Intensity': BlendModes.MINIMUM_INTENSITY_BLEND,
  'Average Intensity': BlendModes.AVERAGE_INTENSITY_BLEND,
};
let currentBlendMode = BlendModes.MAXIMUM_INTENSITY_BLEND;
let currentSlabThickness = 500;
let currentInvert = true;

function applyMipPresentation(): void {
  const viewport = getViewport(mipViewportId) as PlanarViewport | undefined;

  viewport?.setDisplaySetPresentation(mipDataId, {
    blendMode: currentBlendMode,
    slabThickness: currentSlabThickness,
    invert: currentInvert,
  });
  viewport?.render();
}

setTitleAndDescription(
  'PET projection rendering across GPU backends',
  'A coronal planar GenericViewport rendering an inverted full-volume ' +
    'PET projection (maximum/minimum/average intensity via the slab ' +
    'dropdown and thickness slider). Mouse wheel rotates the projection ' +
    'around the patient axis (rotating MIP). Use the buttons to switch the render backend ' +
    'between webgpu and gpu (WebGL) — the CPU backend is intentionally ' +
    'omitted. Tip: append ' +
    '?renderBackend=webgpu|gpu to pick the initial backend.'
);

const size = '512px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.flexWrap = 'wrap';

const mipElement = document.createElement('div');
mipElement.id = `element-${mipViewportId}`;
mipElement.style.width = size;
mipElement.style.height = size;
mipElement.style.flexShrink = '0';
mipElement.oncontextmenu = (e) => e.preventDefault();
viewportGrid.appendChild(mipElement);

content.appendChild(viewportGrid);

const debugPanel = document.createElement('pre');
debugPanel.id = 'webgpu-backend-debug';
debugPanel.style.border = '1px solid #555';
debugPanel.style.padding = '8px';
debugPanel.style.marginTop = '8px';
debugPanel.style.maxWidth = size;
debugPanel.style.whiteSpace = 'pre-wrap';
debugPanel.innerText = 'loading PET volume...';
content.appendChild(debugPanel);

function getViewport(viewportId: string) {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  return renderingEngine?.getViewport(viewportId);
}

function updateDebugPanel(): void {
  const lines: string[] = [];

  lines.push(`configured backend: ${getRenderBackend()}`);
  lines.push(`effective backend: ${getEffectiveRenderBackend()}`);

  const viewport = getViewport(mipViewportId) as PlanarViewport | undefined;
  const renderMode = viewport?.getDisplaySetRenderMode?.(mipDataId);
  const webgpuInfo = getWebGPUViewportDebugInfo(mipViewportId);
  const gpuLine = webgpuInfo
    ? `WebGPU device ${
        webgpuInfo.initialized ? 'initialized' : 'initializing...'
      }${webgpuInfo.adapter ? ` (${webgpuInfo.adapter})` : ''}`
    : 'WebGL surface';

  lines.push(
    `${mipViewportId}: renderMode=${renderMode ?? '(none)'} | ${gpuLine}`
  );

  debugPanel.innerText = lines.join('\n');
}

const WEBGPU_BACKGROUND: [number, number, number] = [0.05, 0.12, 0.3];

// Tint the viewport blue while the WebGPU backend is selected so the active
// backend is visible at a glance.
function applyBackendBackgrounds(): void {
  const isWebGPU = getEffectiveRenderBackend() === 'webgpu';

  if (
    isWebGPU &&
    setWebGPUViewportBackground(mipViewportId, WEBGPU_BACKGROUND)
  ) {
    getViewport(mipViewportId)?.render();
  }
}

function switchBackend(backend: string): void {
  setRenderBackend(backend, 'example-toolbar');
  applyBackendBackgrounds();
  getViewport(mipViewportId)?.render();
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

addDropdownToToolbar({
  options: {
    values: Object.keys(BLEND_MODE_OPTIONS),
    defaultValue: 'Maximum Intensity',
  },
  onSelectedValueChange: (selected) => {
    currentBlendMode = BLEND_MODE_OPTIONS[String(selected)];
    applyMipPresentation();
  },
});

addSliderToToolbar({
  title: 'Slab Thickness (mm): ',
  range: [10, 600],
  defaultValue: currentSlabThickness,
  onSelectedValueChange: (value) => {
    currentSlabThickness = Number(value);
    applyMipPresentation();
  },
});

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    currentInvert = !currentInvert;
    applyMipPresentation();
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

// Rotates a world vector around an arbitrary axis (Rodrigues rotation).
function rotateAroundAxis(
  vector: Types.Point3,
  axis: Types.Point3,
  radians: number
): Types.Point3 {
  const v = vec3.fromValues(vector[0], vector[1], vector[2]);
  const a = vec3.normalize(vec3.create(), [axis[0], axis[1], axis[2]]);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cross = vec3.cross(vec3.create(), a, v);
  const dot = vec3.dot(a, v);
  const result = vec3.create();

  vec3.scaleAndAdd(result, result, v, cos);
  vec3.scaleAndAdd(result, result, cross, sin);
  vec3.scaleAndAdd(result, result, a, dot * (1 - cos));

  return [result[0], result[1], result[2]];
}

// Mouse wheel on the MIP viewport spins the projection around the patient
// superior-inferior axis (the coronal view's up vector) - a rotating MIP.
function rotateMipAroundPatientAxis(degrees: number): void {
  const viewport = getViewport(mipViewportId) as PlanarViewport | undefined;
  const viewRef = viewport?.getViewReference();

  if (!viewRef?.viewPlaneNormal || !viewRef?.viewUp) {
    return;
  }

  const viewPlaneNormal = rotateAroundAxis(
    viewRef.viewPlaneNormal,
    viewRef.viewUp,
    (degrees * Math.PI) / 180
  );

  viewport.setViewReference({
    ...viewRef,
    viewPlaneNormal,
  });
  viewport.render();
}

async function run() {
  await initDemo();

  if (isWebGPURenderingAvailable()) {
    registerWebGPURenderBackend();
  }

  const requestedBackend = getStringUrlParam('renderBackend');
  const initialBackend =
    requestedBackend && ['webgpu', 'gpu'].includes(requestedBackend)
      ? requestedBackend
      : isWebGPURenderingAvailable()
        ? 'webgpu'
        : 'gpu';

  if (initialBackend !== 'webgpu' || isWebGPURenderingAvailable()) {
    setRenderBackend(initialBackend, 'example-default');
  }

  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
  const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  const loaded = waitForVolumeLoaded(volumeId);
  volume.load();
  await loaded;
  debugPanel.innerText = 'PET volume loaded, mounting viewport...';

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId: mipViewportId,
      type: ViewportType.PLANAR_NEXT,
      element: mipElement,
      defaultOptions: {
        orientation: OrientationAxis.CORONAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
  ]);

  utilities.genericViewportDisplaySetMetadataProvider.add(mipDataId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
    volumeId,
  });
  const mipViewport = getViewport(mipViewportId) as PlanarViewport;

  await mipViewport.setDisplaySets({
    displaySetId: mipDataId,
    options: { orientation: OrientationAxis.CORONAL },
  });

  mipViewport.setDisplaySetPresentation(mipDataId, {
    blendMode: currentBlendMode,
    slabThickness: currentSlabThickness,
    invert: currentInvert,
  });
  mipElement.addEventListener(Events.IMAGE_RENDERED, () => {
    applyBackendBackgrounds();
    updateDebugPanel();
  });

  // Rotating MIP: wheel spins the projection around the patient axis.
  mipElement.addEventListener(
    'wheel',
    (evt) => {
      evt.preventDefault();
      rotateMipAroundPatientAxis(
        evt.deltaY > 0 ? MIP_ROTATION_STEP_DEGREES : -MIP_ROTATION_STEP_DEGREES
      );
    },
    { passive: false }
  );

  mipViewport.render();
  updateDebugPanel();
}

run();
