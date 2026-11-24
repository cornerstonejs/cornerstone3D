import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { BlendModes, Events, OrientationAxis } from '../src/enums';
import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';
import cache from '../src/cache/cache';
import eventTarget from '../src/eventTarget';
import {
  hasLostContext,
  recordLostContext,
  recordVolumeTextureFailure,
  retryGpu,
  setLossyDownsampling,
  setSliceFirst,
} from '../src/init';
import {
  resetGpuSettingsPreset,
  setGpuSettingsPreset,
} from '../src/utilities/gpuSettingsPresets';
import { getRenderingCapabilities } from '../src/utilities/renderingCapabilities';
import {
  PlanarRenderPathDecisionService,
  getGpuVolumePathLimit,
} from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { collectBindingFacts } from '../src/RenderingEngine/helpers/stats/collectBindingFacts';
import {
  WEBGL_CONTEXT_RESTORE_WAIT_MS,
  attachWebGLContextEvents,
} from '../src/RenderingEngine/helpers/attachWebGLContextEvents';
import { displaySetRegistry } from '@cornerstonejs/metadata';

jest.mock('../src/utilities/renderingCapabilities', () => ({
  ...jest.requireActual('../src/utilities/renderingCapabilities'),
  getRenderingCapabilities: jest.fn(),
}));

const PHONE = {
  webgl: true,
  floatLinear: false,
  norm16: true,
  norm16Linear: true,
  max3DTextureSize: 2048,
};
const DESKTOP = { webgl: true, floatLinear: true, max3DTextureSize: 2048 };

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

function setProfile(profile) {
  getRenderingCapabilities.mockReturnValue({
    maxTextureSize: 16384,
    renderer: 'test',
    softwareRasterizer: false,
    webglCanvasCopy: true,
    norm16: true,
    norm16Linear: true,
    float: true,
    halfFloat: true,
    halfFloatLinear: true,
    ...profile,
  });
}

/** A volume with the fields that the decision and the viewport read. */
function createVolume(
  volumeId,
  ArrayType,
  dimensions = [128, 128, 100],
  spacing = [2, 2, 3]
) {
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const origin = [0, 0, 0];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });

  imageData.setDimensions(dimensions);

  return {
    volumeId,
    imageIds: Array.from(
      { length: dimensions[2] },
      (_, i) => `${volumeId}:${i}`
    ),
    dimensions,
    spacing,
    direction,
    origin,
    dataType: ArrayType.name,
    voxelGrid: { dimensions, spacing, direction, origin },
    imageData,
    isDynamicVolume: () => false,
    metadata: { FrameOfReferenceUID: 'plan-frame' },
    loadStatus: { loaded: true, loading: false },
    load: jest.fn(),
    getVoxelQuality: jest.fn(() => undefined),
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => ArrayType,
      getRange: () => [0, 100],
    },
  };
}

const mip10 = {
  slabThickness: 10,
  blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
};

describe('getGpuVolumePathLimit', () => {
  const fits = { arrayType: 'Int16Array', textureDimensions: [512, 512, 300] };

  it('gives no limit for a layer that the device draws exactly', () => {
    expect(getGpuVolumePathLimit(fits, DESKTOP)).toBeUndefined();
    expect(getGpuVolumePathLimit(fits, PHONE)).toBeUndefined();
  });

  it('gives textureSize when an edge is larger than the largest 3D texture', () => {
    expect(
      getGpuVolumePathLimit(fits, { ...DESKTOP, max3DTextureSize: 512 })
    ).toBeUndefined();
    expect(
      getGpuVolumePathLimit(fits, { ...DESKTOP, max3DTextureSize: 256 })
    ).toBe('textureSize');
    expect(
      getGpuVolumePathLimit(fits, { ...DESKTOP, max3DTextureSize: 0 })
    ).toBeUndefined();
  });

  it('gives textureReduced, textureFailed and floatFilter for their facts', () => {
    expect(getGpuVolumePathLimit({ ...fits, wouldReduce: true }, DESKTOP)).toBe(
      'textureReduced'
    );
    expect(getGpuVolumePathLimit({ ...fits, failed: true }, DESKTOP)).toBe(
      'textureFailed'
    );
    expect(
      getGpuVolumePathLimit({ ...fits, arrayType: 'Float32Array' }, PHONE)
    ).toBe('floatFilter');
  });

  it('gives floatFilter for 16-bit data on a device without norm16 and without float linear filtering', () => {
    const noNorm16 = { ...PHONE, norm16: false, norm16Linear: false };

    expect(getGpuVolumePathLimit(fits, noNorm16)).toBe('floatFilter');
    expect(
      getGpuVolumePathLimit({ ...fits, arrayType: 'Uint16Array' }, noNorm16)
    ).toBe('floatFilter');
    expect(
      getGpuVolumePathLimit({ ...fits, arrayType: 'Uint8Array' }, noNorm16)
    ).toBeUndefined();
    expect(
      getGpuVolumePathLimit(fits, { ...DESKTOP, norm16: false })
    ).toBeUndefined();
  });

  it('gives the reasons in a fixed order: failed, size, reduced, float', () => {
    const all = {
      arrayType: 'Float32Array',
      textureDimensions: [4096, 4096, 10],
      wouldReduce: true,
      failed: true,
    };

    expect(getGpuVolumePathLimit(all, PHONE)).toBe('textureFailed');
    expect(getGpuVolumePathLimit({ ...all, failed: false }, PHONE)).toBe(
      'textureSize'
    );
    expect(
      getGpuVolumePathLimit(
        { ...all, failed: false, textureDimensions: [8, 8, 8] },
        PHONE
      )
    ).toBe('textureReduced');
  });

  it('does not limit the GPU path without a profile of a WebGL2 context', () => {
    expect(
      getGpuVolumePathLimit(
        { arrayType: 'Float32Array', failed: true },
        { webgl: false, floatLinear: false }
      )
    ).toBeUndefined();
  });
});

describe('the reason of each decision', () => {
  const ct = createVolume('ct-volume', Int16Array);
  const pt = createVolume('pt-volume', Float32Array);
  const big = createVolume('big-volume', Int16Array, [512, 512, 100]);
  const volumes = { 'ct-volume': ct, 'pt-volume': pt, 'big-volume': big };
  const dataSetOf = (volume) => ({
    imageIds: volume.imageIds,
    volumeId: volume.volumeId,
  });
  let service;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    setProfile(DESKTOP);
    jest.spyOn(cache, 'getVolume').mockImplementation((id) => volumes[id]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    getRenderingCapabilities.mockReset();
    resetGpuSettingsPreset();
    setLossyDownsampling({ final: false });
    retryGpu();
  });

  function decide(volume, options) {
    const { renderMode, reason } = service.select(dataSetOf(volume), {
      orientation: OrientationAxis.CORONAL,
      ...options,
    });

    return [renderMode, reason];
  }

  it('says slice first off, slice and slab', () => {
    expect(decide(ct, { sliceFirst: false, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'sliceFirstOff',
    ]);
    expect(decide(ct, { sliceFirst: true })).toEqual([
      PlanarRenderModeId.VTK_CPU_SLICE,
      'slice',
    ]);
    expect(decide(ct, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);
  });

  it('moves only the float layer on a device that cannot filter float textures', () => {
    setProfile(PHONE);

    expect(decide(pt, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_CPU_SLICE,
      'floatFilter',
    ]);
    expect(decide(ct, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);
  });

  it('samples the slab of a volume larger than the largest 3D texture', () => {
    setProfile({ ...DESKTOP, max3DTextureSize: 256 });

    expect(decide(big, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_CPU_SLICE,
      'textureSize',
    ]);
    expect(decide(ct, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);
    expect(decide(big, { sliceFirst: false, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'sliceFirstOff',
    ]);
  });

  it('samples the slab of a volume that the GPU settings would reduce, unless the application asked for reduced textures', () => {
    setGpuSettingsPreset('low');

    expect(decide(big, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_CPU_SLICE,
      'textureReduced',
    ]);
    expect(decide(ct, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);

    setLossyDownsampling({ final: true });

    expect(decide(big, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);

    setProfile({ ...DESKTOP, max3DTextureSize: 128 });

    expect(decide(big, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_CPU_SLICE,
      'textureSize',
    ]);
  });

  it('samples the slab of a volume whose 3D texture failed until retryGpu', () => {
    recordVolumeTextureFailure('ct-volume');

    expect(decide(ct, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_CPU_SLICE,
      'textureFailed',
    ]);
    expect(decide(pt, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);

    retryGpu();

    expect(decide(ct, { sliceFirst: true, ...mip10 })).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'slab',
    ]);
  });

  it('says why a backend that draws on the CPU was chosen', () => {
    expect(decide(ct, { sliceFirst: true, renderBackend: 'cpu' })).toEqual([
      PlanarRenderModeId.CANVAS_CPU_SLICE,
      'pinned',
    ]);

    setProfile({ ...DESKTOP, webgl: false });

    expect(decide(ct, { sliceFirst: true, renderBackend: 'cpu' })).toEqual([
      PlanarRenderModeId.CANVAS_CPU_SLICE,
      'noWebGL',
    ]);
  });

  it('says frame for the acquired frames of an image stack', () => {
    const { renderMode, reason } = service.select(
      { imageIds: ['stack:0', 'stack:1'] },
      { orientation: OrientationAxis.ACQUISITION, sliceFirst: true }
    );

    expect([renderMode, reason]).toEqual([
      PlanarRenderModeId.VTK_FRAME,
      'frame',
    ]);
  });
});

describe('PlanarViewport render plan', () => {
  const ctId = 'ct-display-set';
  const ptId = 'pt-display-set';
  const engineId = 'plan-engine';
  let viewport;
  let ct;
  let pt;
  let events;
  let elementEvents;
  let mountedModes;
  let failingMode;
  let failLoads;

  const onPlanChanged = (evt) => events.push(evt.detail);

  beforeEach(() => {
    const camera = vtkCamera.newInstance();
    let props = [];
    const renderer = {
      getActiveCamera: jest.fn(() => camera),
      addActor: jest.fn(),
      removeActor: jest.fn(),
      getActors: jest.fn(() => []),
      resetCameraClippingRange: jest.fn(),
      computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
      getViewProps: () => props,
      addViewProp: (prop) => {
        if (!props.includes(prop)) {
          props.push(prop);
        }
      },
      removeViewProp: (prop) => {
        props = props.filter((item) => item !== prop);
      },
    };

    setProfile(PHONE);
    ct = createVolume('ct-volume', Int16Array);
    pt = createVolume('pt-volume', Float32Array);

    const volumeOf = { [ctId]: ct, [ptId]: pt };

    renderingEngineCache.set({
      id: engineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: jest.fn(),
    });
    viewport = new PlanarViewport({
      id: 'plan-viewport',
      element: document.createElement('div'),
      renderingEngineId: engineId,
      canvas: document.createElement('canvas'),
      sWidth: 200,
      sHeight: 100,
      defaultOptions: {},
    });
    [ctId, ptId].forEach((id) => {
      displaySetRegistry.add(id, {
        imageIds: volumeOf[id].imageIds,
        volumeId: volumeOf[id].volumeId,
      });
    });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => ({ 'ct-volume': ct, 'pt-volume': pt })[id]);
    jest
      .spyOn(viewport.dataProvider, 'load')
      .mockImplementation((id, options) =>
        failLoads
          ? Promise.reject(new Error('cannot load'))
          : Promise.resolve({
              id,
              type: 'image',
              imageIds: volumeOf[id].imageIds,
              imageVolume: volumeOf[id],
              renderMode: options.renderMode,
              volumeId: volumeOf[id].volumeId,
            })
      );
    mountedModes = [];
    failingMode = undefined;
    failLoads = false;
    viewport.renderPathResolver = {
      resolve: (_type, _data, options) => ({
        createRenderPath: () => ({
          addData: async (_ctx, data) => {
            if (options.renderMode === failingMode) {
              throw new Error(`cannot mount ${failingMode}`);
            }

            const actor = {
              displaySetId: data.id,
              renderMode: options.renderMode,
            };

            mountedModes.push([data.id, options.renderMode]);
            renderer.addViewProp(actor);

            return {
              rendering: {
                renderMode: options.renderMode,
                imageVolume: volumeOf[data.id],
                imageIds: volumeOf[data.id].imageIds,
                currentImageIdIndex: 0,
                maxImageIdIndex: volumeOf[data.id].imageIds.length - 1,
              },
              updateAppearance: jest.fn(),
              applyViewState: jest.fn(),
              getFrameOfReferenceUID: () => 'plan-frame',
              getActorEntry: () => ({ uid: `${data.id}-actor`, actor }),
              removeData: jest.fn(() => renderer.removeViewProp(actor)),
            };
          },
        }),
      }),
    };
    events = [];
    elementEvents = [];
    eventTarget.addEventListener(Events.RENDER_PLAN_CHANGED, onPlanChanged);
    viewport.element.addEventListener(Events.RENDER_PLAN_CHANGED, (evt) =>
      elementEvents.push(evt.detail)
    );
  });

  afterEach(() => {
    eventTarget.removeEventListener(Events.RENDER_PLAN_CHANGED, onPlanChanged);
    viewport.destroy();
    renderingEngineCache.delete(engineId);
    setSliceFirst(false);
    retryGpu();
    displaySetRegistry.clear();
    jest.restoreAllMocks();
    getRenderingCapabilities.mockReset();
  });

  async function mountFusion() {
    await viewport.setDisplaySets(
      {
        displaySetId: ctId,
        options: { orientation: OrientationAxis.CORONAL, sliceFirst: true },
      },
      {
        displaySetId: ptId,
        options: { orientation: OrientationAxis.CORONAL, sliceFirst: true },
      }
    );
    await flush();
  }

  async function setSlab(props) {
    viewport.setDisplaySetAppearance(ctId, props);
    viewport.setDisplaySetAppearance(ptId, props);
    await flush();
  }

  const planOf = () =>
    viewport
      .getRenderPlan()
      .map(({ displaySetId, slice, draw, backend, reason }) => [
        displaySetId,
        slice,
        draw,
        backend,
        reason,
      ]);

  const eventsOf = (displaySetId) =>
    events.filter((e) => e.displaySetId === displaySetId);

  it('gives the plan of each layer, source first, and fires one event for each added layer', async () => {
    await mountFusion();

    expect(planOf()).toEqual([
      [ctId, 'cpu', 'gpu', 'gpu', 'slice'],
      [ptId, 'cpu', 'gpu', 'gpu', 'slice'],
    ]);
    expect(viewport.getRenderPlan().map((layer) => layer.role)).toEqual([
      'source',
      'overlay',
    ]);
    expect(events.map((e) => [e.displaySetId, e.previous, e.reason])).toEqual([
      [ctId, undefined, 'slice'],
      [ptId, undefined, 'slice'],
    ]);
    expect(elementEvents).toEqual(events);
    expect(viewport.getRenderPlan()).toEqual(viewport.getRenderPlan());
  });

  it('moves the integer layer to the GPU slab and keeps the float layer on the CPU, with one event each', async () => {
    await mountFusion();
    events.length = 0;

    await setSlab(mip10);

    expect(planOf()).toEqual([
      [ctId, 'gpuVolume', 'gpu', 'gpu', 'slab'],
      [ptId, 'cpu', 'gpu', 'gpu', 'floatFilter'],
    ]);
    expect(eventsOf(ctId).length).toBe(1);
    expect(eventsOf(ptId).length).toBe(1);
    expect(eventsOf(ctId)[0].previous.slice).toBe('cpu');
    expect(eventsOf(ctId)[0].current.slice).toBe('gpuVolume');
    expect(eventsOf(ctId)[0].current.backend).toBe('gpu');
  });

  it('updates the reason of layers that keep their render mode when a slab comes, with no remount', async () => {
    setProfile({ ...PHONE, norm16: false, norm16Linear: false });
    await mountFusion();
    events.length = 0;
    mountedModes.length = 0;

    await setSlab(mip10);

    expect(planOf()).toEqual([
      [ctId, 'cpu', 'gpu', 'gpu', 'floatFilter'],
      [ptId, 'cpu', 'gpu', 'gpu', 'floatFilter'],
    ]);
    expect(mountedModes).toEqual([]);
    expect(eventsOf(ctId).length).toBe(1);
    expect(eventsOf(ptId).length).toBe(1);

    await setSlab({ slabThickness: 0 });

    expect(planOf().map((layer) => layer[4])).toEqual(['slice', 'slice']);
  });

  it('sends a layer whose 3D texture failed to the CPU slab, keeps it there, and goes back up only on retryGpu', async () => {
    await mountFusion();
    await setSlab(mip10);
    events.length = 0;
    mountedModes.length = 0;

    recordVolumeTextureFailure('ct-volume');
    await nextTask();
    await flush();

    expect(planOf()[0]).toEqual([ctId, 'cpu', 'gpu', 'gpu', 'textureFailed']);
    expect(eventsOf(ctId).length).toBe(1);
    expect(eventsOf(ptId).length).toBe(0);

    await setSlab({ slabThickness: 0 });
    await setSlab(mip10);
    await setSlab({ slabThickness: 0 });
    await setSlab(mip10);

    expect(planOf()[0][4]).toBe('textureFailed');
    expect(
      mountedModes.filter(
        ([id, mode]) =>
          id === ctId && mode === PlanarRenderModeId.VTK_GPU_VOLUME_SLICE
      )
    ).toEqual([]);

    events.length = 0;
    retryGpu();
    await flush();

    expect(planOf()[0]).toEqual([ctId, 'gpuVolume', 'gpu', 'gpu', 'slab']);
    expect(eventsOf(ctId).length).toBe(1);
  });

  it('draws the new slab on the mounted path when the remount to another path throws', async () => {
    await mountFusion();
    failingMode = PlanarRenderModeId.VTK_GPU_VOLUME_SLICE;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await setSlab(mip10);

    const ct = viewport.bindings.get(ctId);
    const lastProps = ct.updateAppearance.mock.calls.at(-1)[0];

    expect(ct.rendering.renderMode).toBe(PlanarRenderModeId.VTK_CPU_SLICE);
    expect(lastProps.slabThickness).toBe(10);
    expect(lastProps.blendMode).toBe(BlendModes.MAXIMUM_INTENSITY_BLEND);
    expect(viewport.withheldSlabByBinding.has(ct)).toBe(false);
  });

  it('draws the new slab on the mounted path when the load of a remount throws', async () => {
    await mountFusion();
    failLoads = true;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await setSlab(mip10);

    const ct = viewport.bindings.get(ctId);

    expect(ct.rendering.renderMode).toBe(PlanarRenderModeId.VTK_CPU_SLICE);
    expect(ct.updateAppearance.mock.calls.at(-1)[0].slabThickness).toBe(10);
    expect(viewport.withheldSlabByBinding.has(ct)).toBe(false);
  });

  it('forgets the plan of a removed layer', async () => {
    await mountFusion();

    viewport.removeDisplaySet(ptId);

    expect(planOf().map(([displaySetId]) => displaySetId)).toEqual([ctId]);
  });
});

describe('the reason in the debug modal', () => {
  it('reads the reason of each binding from the render plan', () => {
    const facts = collectBindingFacts(
      {
        getDebugBindings: () => [
          { displaySetId: 'ct', role: 'source' },
          { displaySetId: 'pt', role: 'overlay' },
        ],
        getRenderPlan: () => [
          { displaySetId: 'ct', reason: 'slab' },
          { displaySetId: 'pt', reason: 'floatFilter' },
        ],
      },
      () => 0
    );

    expect(facts.get('ct').reason).toBe('slab');
    expect(facts.get('pt').reason).toBe('floatFilter');
  });

  it('gives no reason for a viewport without a render plan', () => {
    const facts = collectBindingFacts(
      { getDebugBindings: () => [{ displaySetId: 'ct' }] },
      () => 0
    );

    expect(facts.get('ct').reason).toBeUndefined();
  });
});

describe('a WebGL context that is lost', () => {
  const ct = createVolume('ct-volume', Int16Array);
  const dataSet = { imageIds: ct.imageIds, volumeId: 'ct-volume' };
  let canvas;
  let detach;

  beforeEach(() => {
    jest.useFakeTimers();
    setProfile(DESKTOP);
    jest.spyOn(cache, 'getVolume').mockImplementation(() => ct);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    canvas = document.createElement('canvas');
    detach = attachWebGLContextEvents(
      {
        getOpenGLRenderWindow: () => ({
          getCanvas: () => canvas,
          isDeleted: () => false,
          getInitialized: () => false,
        }),
      },
      'lost-engine'
    );
  });

  afterEach(() => {
    detach();
    retryGpu();
    setSliceFirst(false);
    jest.useRealTimers();
    jest.restoreAllMocks();
    getRenderingCapabilities.mockReset();
  });

  const decide = () => {
    const { renderMode, reason } = new PlanarRenderPathDecisionService().select(
      dataSet,
      { orientation: OrientationAxis.CORONAL }
    );

    return [renderMode, reason];
  };

  it('changes nothing when it comes back in time', () => {
    setSliceFirst(true);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    jest.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_WAIT_MS - 1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    jest.advanceTimersByTime(10 * WEBGL_CONTEXT_RESTORE_WAIT_MS);

    expect(hasLostContext()).toBe(false);
    expect(decide()).toEqual([PlanarRenderModeId.VTK_CPU_SLICE, 'slice']);
  });

  it('makes auto draw on the CPU with slice first on when it does not come back, until retryGpu', () => {
    setSliceFirst(true);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    jest.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_WAIT_MS);

    expect(hasLostContext()).toBe(true);
    expect(decide()).toEqual([
      PlanarRenderModeId.CANVAS_CPU_SLICE,
      'contextLost',
    ]);

    retryGpu();

    expect(decide()).toEqual([PlanarRenderModeId.VTK_CPU_SLICE, 'slice']);
  });

  it('changes nothing with slice first off', () => {
    recordLostContext();

    expect(hasLostContext()).toBe(false);
    expect(decide()).toEqual([
      PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      'sliceFirstOff',
    ]);
  });
});
