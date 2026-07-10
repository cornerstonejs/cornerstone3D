import { vec3 } from 'gl-matrix';
import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  CONSTANTS,
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
const ctVolumeId = `${volumeLoaderScheme}:CT_VOLUME_ID`;
const mipDataId = 'webgpu-pet-mip:planar';
const volume3dDataId = 'webgpu-pet-mip:volume3d';
const mipViewportId = 'PT_MIP_PLANAR';
const volume3dViewportId = 'CT_VOLUME_3D';
const volumePresetName = 'CT-Bone';
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
  'Left: a coronal planar GenericViewport rendering an inverted full-volume ' +
    'PET projection (maximum/minimum/average intensity via the slab ' +
    'dropdown and thickness slider). Mouse wheel rotates the projection ' +
    'around the patient axis (rotating MIP). Right: a true 3D ' +
    'volume-rendering GenericViewport (VOLUME_3D_NEXT) showing the CT of ' +
    'the same study with the CT-Bone preset; drag with the left mouse ' +
    'button to rotate it. Use the buttons to switch the render backend ' +
    'between webgpu and gpu (WebGL) — the CPU backend is intentionally ' +
    'omitted. Note: the 3D volume viewport has no WebGPU render mode yet, ' +
    'so it reports its actual mode in the panel regardless of the selected ' +
    'backend; its blue tint on webgpu is only a visual cue. Tip: append ' +
    '?renderBackend=webgpu|gpu to pick the initial backend.'
);

const size = '512px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.flexWrap = 'wrap';

const elements = [mipViewportId, volume3dViewportId].map((viewportId) => {
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

  for (const [viewportId, dataId] of [
    [mipViewportId, mipDataId],
    [volume3dViewportId, volume3dDataId],
  ]) {
    const viewport = getViewport(viewportId) as PlanarViewport | undefined;
    const renderMode = viewport?.getDisplaySetRenderMode?.(dataId);
    const webgpuInfo = getWebGPUViewportDebugInfo(viewportId);
    const gpuLine = webgpuInfo
      ? `WebGPU device ${
          webgpuInfo.initialized ? 'initialized' : 'initializing...'
        }${webgpuInfo.adapter ? ` (${webgpuInfo.adapter})` : ''}`
      : 'WebGL surface';

    lines.push(
      `${viewportId}: renderMode=${renderMode ?? '(none)'} | ${gpuLine}`
    );
  }

  debugPanel.innerText = lines.join('\n');
}

const WEBGPU_BACKGROUND: [number, number, number] = [0.05, 0.12, 0.3];
const DEFAULT_BACKGROUND: [number, number, number] = [0.2, 0, 0.2];

// Tints both viewports blue while the webgpu backend is selected so the
// active backend is visible at a glance. The 3D viewport always renders
// through WebGL (it has no webgpu render mode), so its background is set on
// the vtk renderer directly and the tint is purely an example-level cue --
// the debug panel keeps reporting its real render mode.
function applyBackendBackgrounds(): void {
  const isWebGPU = getEffectiveRenderBackend() === 'webgpu';

  if (
    isWebGPU &&
    setWebGPUViewportBackground(mipViewportId, WEBGPU_BACKGROUND)
  ) {
    getViewport(mipViewportId)?.render();
  }

  const volume3dViewport = getViewport(volume3dViewportId) as unknown as {
    getRenderer?: () => {
      getBackground: () => number[];
      setBackground: (rgb: number[]) => boolean;
    };
    render: () => void;
  };
  const renderer = volume3dViewport?.getRenderer?.();

  if (!renderer) {
    return;
  }

  const target = isWebGPU ? WEBGPU_BACKGROUND : DEFAULT_BACKGROUND;
  const current = renderer.getBackground();

  if (
    current[0] !== target[0] ||
    current[1] !== target[1] ||
    current[2] !== target[2]
  ) {
    renderer.setBackground([...target]);
    volume3dViewport.render();
  }
}

function switchBackend(backend: string): void {
  setRenderBackend(backend, 'example-toolbar');
  applyBackendBackgrounds();
  [mipViewportId, volume3dViewportId].forEach((viewportId) =>
    getViewport(viewportId)?.render()
  );
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

function applyVolumeRenderingPreset(viewport: {
  getDefaultActor?: () => Types.ActorEntry | undefined;
}): void {
  const preset = CONSTANTS.VIEWPORT_PRESETS.find(
    ({ name }) => name === volumePresetName
  );
  const actorEntry = viewport.getDefaultActor?.();

  if (!preset || !actorEntry?.actor) {
    return;
  }

  utilities.applyPreset(actorEntry.actor as never, preset);
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

// Left-button drag on the 3D viewport orbits the camera around the focal
// point: horizontal drag rotates around the view-up axis, vertical drag
// around the camera's right axis.
function rotateVolume3dCamera(dxDegrees: number, dyDegrees: number): void {
  const viewport = getViewport(volume3dViewportId) as unknown as {
    getViewState?: () => {
      position?: Types.Point3;
      focalPoint?: Types.Point3;
      viewUp?: Types.Point3;
    };
    setViewState?: (patch: object) => void;
    render: () => void;
  };
  const state = viewport?.getViewState?.();

  if (!state?.position || !state?.focalPoint || !state?.viewUp) {
    return;
  }

  const { position, focalPoint, viewUp } = state;
  let direction: Types.Point3 = [
    position[0] - focalPoint[0],
    position[1] - focalPoint[1],
    position[2] - focalPoint[2],
  ];
  let newViewUp: Types.Point3 = [...viewUp] as Types.Point3;

  direction = rotateAroundAxis(
    direction,
    newViewUp,
    (dxDegrees * Math.PI) / 180
  );

  const right = vec3.cross(
    vec3.create(),
    [newViewUp[0], newViewUp[1], newViewUp[2]],
    [direction[0], direction[1], direction[2]]
  );
  const rightAxis: Types.Point3 = [right[0], right[1], right[2]];

  direction = rotateAroundAxis(
    direction,
    rightAxis,
    (dyDegrees * Math.PI) / 180
  );
  newViewUp = rotateAroundAxis(
    newViewUp,
    rightAxis,
    (dyDegrees * Math.PI) / 180
  );

  viewport.setViewState?.({
    position: [
      focalPoint[0] + direction[0],
      focalPoint[1] + direction[1],
      focalPoint[2] + direction[2],
    ] as Types.Point3,
    focalPoint,
    viewUp: newViewUp,
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

  const [imageIds, ctImageIds] = await Promise.all([
    createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
      wadoRsRoot,
    }),
    createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
      wadoRsRoot,
    }),
  ]);

  const [volume, ctVolume] = await Promise.all([
    volumeLoader.createAndCacheVolume(volumeId, { imageIds }),
    volumeLoader.createAndCacheVolume(ctVolumeId, { imageIds: ctImageIds }),
  ]);
  const loaded = Promise.all([
    waitForVolumeLoaded(volumeId),
    waitForVolumeLoaded(ctVolumeId),
  ]);
  volume.load();
  ctVolume.load();
  await loaded;
  debugPanel.innerText = 'PET and CT volumes loaded, mounting viewports...';

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId: mipViewportId,
      type: ViewportType.PLANAR_NEXT,
      element: elements[0],
      defaultOptions: {
        orientation: OrientationAxis.CORONAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: volume3dViewportId,
      type: ViewportType.VOLUME_3D_NEXT,
      element: elements[1],
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
  utilities.genericViewportDisplaySetMetadataProvider.add(volume3dDataId, {
    imageIds: ctImageIds,
    volumeId: ctVolumeId,
  });

  const mipViewport = getViewport(mipViewportId) as PlanarViewport;
  const volume3dViewport = getViewport(volume3dViewportId) as PlanarViewport;

  await Promise.all([
    mipViewport.setDisplaySets({
      displaySetId: mipDataId,
      options: { orientation: OrientationAxis.CORONAL },
    }),
    volume3dViewport.setDisplaySets({
      displaySetId: volume3dDataId,
      options: { renderMode: 'vtkVolume3d' },
    }),
  ]);

  mipViewport.setDisplaySetPresentation(mipDataId, {
    blendMode: currentBlendMode,
    slabThickness: currentSlabThickness,
    invert: currentInvert,
  });
  volume3dViewport.setDisplaySetPresentation?.(volume3dDataId, {
    sampleDistanceMultiplier: 1,
  });
  applyVolumeRenderingPreset(
    volume3dViewport as unknown as {
      getDefaultActor?: () => Types.ActorEntry | undefined;
    }
  );

  [mipViewportId, volume3dViewportId].forEach((viewportId) => {
    const element = document.getElementById(`element-${viewportId}`);
    element?.addEventListener(Events.IMAGE_RENDERED, () => {
      applyBackendBackgrounds();
      updateDebugPanel();
    });
  });

  // Rotating MIP: wheel spins the projection around the patient axis.
  elements[0].addEventListener(
    'wheel',
    (evt) => {
      evt.preventDefault();
      rotateMipAroundPatientAxis(
        evt.deltaY > 0 ? MIP_ROTATION_STEP_DEGREES : -MIP_ROTATION_STEP_DEGREES
      );
    },
    { passive: false }
  );

  // 3D viewport: left-button drag orbits the camera. While dragging, the
  // volume mapper's sample distance is coarsened by the same factor the
  // legacy TrackballRotateTool uses, then restored on release with a final
  // full-resolution render.
  const ROTATE_SAMPLE_DISTANCE_FACTOR = 2;
  let dragging = false;
  let restingSampleDistance: number | undefined;

  const getVolume3dMapper = () => {
    const viewport = getViewport(volume3dViewportId) as unknown as {
      getDefaultActor?: () => Types.ActorEntry | undefined;
    };
    const actor = viewport?.getDefaultActor?.()?.actor as {
      getMapper?: () => {
        getSampleDistance?: () => number;
        setSampleDistance?: (distance: number) => boolean;
      };
    };

    return actor?.getMapper?.();
  };

  elements[1].addEventListener('pointerdown', (evt) => {
    if (evt.button === 0) {
      dragging = true;
      elements[1].setPointerCapture(evt.pointerId);

      const mapper = getVolume3dMapper();

      if (mapper?.getSampleDistance && restingSampleDistance === undefined) {
        restingSampleDistance = mapper.getSampleDistance();
        mapper.setSampleDistance?.(
          restingSampleDistance * ROTATE_SAMPLE_DISTANCE_FACTOR
        );
      }
    }
  });
  elements[1].addEventListener('pointerup', (evt) => {
    dragging = false;
    elements[1].releasePointerCapture(evt.pointerId);

    if (restingSampleDistance !== undefined) {
      getVolume3dMapper()?.setSampleDistance?.(restingSampleDistance);
      restingSampleDistance = undefined;
      getViewport(volume3dViewportId)?.render();
    }
  });
  elements[1].addEventListener('pointermove', (evt) => {
    if (dragging) {
      // Canvas Y grows downward; negate it so a drag up rotates the body up,
      // matching the legacy TrackballRotateTool direction convention.
      rotateVolume3dCamera(-evt.movementX * 0.5, -evt.movementY * 0.5);
    }
  });

  mipViewport.render();
  volume3dViewport.render();
  updateDebugPanel();
}

run();
