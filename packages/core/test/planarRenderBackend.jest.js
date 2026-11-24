import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';
import { Events, RenderBackends } from '../src/enums';
import {
  getEffectiveRenderBackend,
  getRenderBackend,
  isCornerstoneInitialized,
  resetInitialization,
  setRenderBackend,
} from '../src/init';
import eventTarget from '../src/eventTarget';
import cache from '../src/cache/cache';
import { PlanarRenderPathDecisionService } from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import {
  __resetRenderBackendRegistry,
  getRenderBackendForRenderMode,
  getRenderModeForBackend,
  getRenderPlanSliceForRenderMode,
  getRenderSurfaceForRenderMode,
  isRegisteredRenderBackend,
  registerRenderBackend,
} from '../src/RenderingEngine/helpers/renderBackendRegistry';
import { createDefaultPlanarRenderPaths } from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathResolver';
import { createRenderPlanLayer } from '../src/RenderingEngine/Viewports/Planar/planarRenderPlan';

const IMAGE_DATASET = { imageIds: ['plain-img-1'] };
const VOLUME_DATASET = {
  imageIds: ['vol-img-1', 'vol-img-2'],
  volumeId: 'vol-1',
};

describe('Planar render backend resolution', () => {
  let service;
  let getVolumeSpy;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    getVolumeSpy = jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((volumeId) =>
        volumeId === 'vol-1' ? { volumeId } : undefined
      );
  });

  afterEach(() => {
    getVolumeSpy.mockRestore();
    setRenderBackend(RenderBackends.Auto);
    eventTarget.reset();
  });

  describe('image path', () => {
    it('selects the GPU image path by default (auto, no CPU flag)', () => {
      const { renderMode } = service.select(IMAGE_DATASET);
      expect(renderMode).toBe(PlanarRenderModeId.VTK_FRAME);
    });

    it('selects the CPU image path when the global backend is pinned to cpu', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(IMAGE_DATASET);
      expect(renderMode).toBe(PlanarRenderModeId.CANVAS_FRAME);
    });

    it('lets a per-mount cpu pin win over a global gpu pin', () => {
      setRenderBackend('gpu');
      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'cpu',
      });
      expect(renderMode).toBe(PlanarRenderModeId.CANVAS_FRAME);
    });

    it('lets a per-mount gpu pin win over a global cpu pin', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'gpu',
      });
      expect(renderMode).toBe(PlanarRenderModeId.VTK_FRAME);
    });

    it('resolves a per-mount auto from capability detection even under a global cpu pin', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'auto',
      });
      expect(renderMode).toBe(PlanarRenderModeId.VTK_FRAME);
    });
  });

  describe('volume path', () => {
    it('selects the GPU volume slice path by default', () => {
      const { renderMode } = service.select(VOLUME_DATASET);
      expect(renderMode).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
    });

    it('honors a per-mount cpu pin for volume datasets', () => {
      const { renderMode } = service.select(VOLUME_DATASET, {
        renderBackend: 'cpu',
      });
      expect(renderMode).toBe(PlanarRenderModeId.CANVAS_CPU_SLICE);
    });

    it('honors a per-mount gpu pin over a global cpu pin for volume datasets', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(VOLUME_DATASET, {
        renderBackend: 'gpu',
      });
      expect(renderMode).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
    });

    it('selects the CPU volume path with a global cpu pin', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(VOLUME_DATASET);
      expect(renderMode).toBe(PlanarRenderModeId.CANVAS_CPU_SLICE);
    });
  });

  describe('setRenderBackend', () => {
    it('updates the configured and effective backends', () => {
      expect(getRenderBackend()).toBe(RenderBackends.Auto);
      expect(getEffectiveRenderBackend()).toBe(RenderBackends.GPU);

      setRenderBackend('cpu');

      expect(getRenderBackend()).toBe(RenderBackends.CPU);
      expect(getEffectiveRenderBackend()).toBe(RenderBackends.CPU);
    });

    it('rejects invalid values', () => {
      expect(() => setRenderBackend('turbo')).toThrow();
    });

    it('does not mark cornerstone initialized when called before init()', () => {
      resetInitialization();

      setRenderBackend('cpu');

      // A pre-init setRenderBackend must leave init() able to run: marking
      // the library initialized here would turn the later init(configuration)
      // into a no-op and silently drop the user's configuration.
      expect(isCornerstoneInitialized()).toBe(false);
      expect(getRenderBackend()).toBe(RenderBackends.CPU);
    });

    it('emits RENDER_BACKEND_CHANGED with previous/current/effective detail', () => {
      const listener = jest.fn();
      eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, listener);

      setRenderBackend('cpu', 'unit-test');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail).toEqual({
        previous: RenderBackends.Auto,
        current: RenderBackends.CPU,
        effectiveBackend: RenderBackends.CPU,
        reason: 'unit-test',
      });

      eventTarget.removeEventListener(Events.RENDER_BACKEND_CHANGED, listener);
    });

    it('does not emit when the backend does not change', () => {
      setRenderBackend('cpu');

      const listener = jest.fn();
      eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, listener);

      setRenderBackend('cpu');

      expect(listener).not.toHaveBeenCalled();
      eventTarget.removeEventListener(Events.RENDER_BACKEND_CHANGED, listener);
    });
  });

  describe('the slots of registerRenderBackend', () => {
    afterEach(() => {
      __resetRenderBackendRegistry();
    });

    /** The plan entry of a layer drawn with a render mode, without its ids. */
    function layerOf(renderMode) {
      const { slice, draw, backend } = createRenderPlanLayer(
        'layer',
        'source',
        renderMode,
        'pinned'
      );

      return { slice, draw, backend };
    }

    it('files the modes of the core backends under frame, cpu and gpuVolume', () => {
      expect(getRenderModeForBackend('gpu', 'frame')).toBe(
        PlanarRenderModeId.VTK_FRAME
      );
      expect(getRenderModeForBackend('gpu', 'cpu')).toBe(
        PlanarRenderModeId.VTK_CPU_SLICE
      );
      expect(getRenderModeForBackend('gpu', 'gpuVolume')).toBe(
        PlanarRenderModeId.VTK_GPU_VOLUME_SLICE
      );
      expect(getRenderModeForBackend('cpu', 'frame')).toBe(
        PlanarRenderModeId.CANVAS_FRAME
      );
      expect(getRenderModeForBackend('cpu', 'cpu')).toBe(
        PlanarRenderModeId.CANVAS_CPU_SLICE
      );
      expect(getRenderModeForBackend('cpu', 'gpuVolume')).toBeUndefined();
      expect(layerOf(PlanarRenderModeId.CANVAS_CPU_SLICE)).toEqual({
        slice: 'cpu',
        draw: 'cpu',
        backend: 'cpu',
      });
      expect(layerOf(PlanarRenderModeId.VTK_CPU_SLICE)).toEqual({
        slice: 'cpu',
        draw: 'gpu',
        backend: 'gpu',
      });
    });

    it('gives a layer the slot of its mode as its slice, for each slot', () => {
      registerRenderBackend({
        backend: 'test:slots',
        renderModes: {
          frame: { id: 'test:slotsFrame' },
          cpu: { id: 'test:slotsCpu' },
          gpuVolume: { id: 'test:slotsGpuVolume' },
        },
      });

      expect(layerOf('test:slotsFrame')).toEqual({
        slice: 'frame',
        draw: 'gpu',
        backend: 'test:slots',
      });
      expect(layerOf('test:slotsCpu')).toEqual({
        slice: 'cpu',
        draw: 'gpu',
        backend: 'test:slots',
      });
      expect(layerOf('test:slotsGpuVolume')).toEqual({
        slice: 'gpuVolume',
        draw: 'gpu',
        backend: 'test:slots',
      });
      expect(getRenderPlanSliceForRenderMode('test:slotsCpu')).toBe('cpu');
    });

    it('selects the frame slot for a stack and the slot that a volume needs', () => {
      registerRenderBackend({
        backend: 'test:canvasCpu',
        renderModes: {
          frame: { id: 'test:canvasCpuFrame' },
          cpu: { id: 'test:canvasCpuSlice' },
        },
        surface: 'cpu',
      });
      registerRenderBackend({
        backend: 'test:gpuVolumeOnly',
        renderModes: {
          frame: { id: 'test:gpuVolumeOnlyFrame' },
          gpuVolume: { id: 'test:gpuVolumeOnlySlice' },
        },
      });

      expect(
        service.select(IMAGE_DATASET, { renderBackend: 'test:canvasCpu' })
          .renderMode
      ).toBe('test:canvasCpuFrame');
      expect(
        service.select(VOLUME_DATASET, { renderBackend: 'test:canvasCpu' })
          .renderMode
      ).toBe('test:canvasCpuSlice');
      expect(layerOf('test:canvasCpuSlice')).toEqual({
        slice: 'cpu',
        draw: 'cpu',
        backend: 'test:canvasCpu',
      });
      expect(
        service.select(VOLUME_DATASET, {
          renderBackend: 'test:gpuVolumeOnly',
        }).renderMode
      ).toBe('test:gpuVolumeOnlySlice');
      expect(layerOf('test:gpuVolumeOnlySlice').slice).toBe('gpuVolume');
    });

    it('rejects a backend without a frame mode, as one with the old slot names', () => {
      expect(() =>
        registerRenderBackend({
          backend: 'test:noFrame',
          renderModes: { gpuVolume: { id: 'test:noFrameVolume' } },
        })
      ).toThrow(/must declare renderModes.frame/);
      expect(() =>
        registerRenderBackend({
          backend: 'test:oldSlots',
          renderModes: {
            image: { id: 'test:oldSlotsImage' },
            volume: { id: 'test:oldSlotsVolume' },
          },
        })
      ).toThrow(/must declare renderModes.frame/);
    });
  });

  describe('registered custom backends', () => {
    const fancyRenderPath = {
      id: 'test:fancy-image-slice',
      type: 'planar',
      matches: (data, options) =>
        data.type === 'image' && options.renderMode === 'test:fancyImage',
      createRenderPath: () => {
        throw new Error('not exercised in this test');
      },
    };

    beforeAll(() => {
      registerRenderBackend({
        name: 'FANCY',
        backend: 'test:fancy',
        renderModes: {
          frame: {
            id: 'test:fancyImage',
            createDefinition: () => fancyRenderPath,
          },
          cpu: { id: 'test:fancyVolume' },
        },
        surface: 'cpu',
      });
      registerRenderBackend({
        backend: 'test:imageOnly',
        renderModes: { frame: { id: 'test:imageOnlyImage' } },
      });
    });

    afterAll(() => {
      __resetRenderBackendRegistry();
    });

    it('reports built-in and custom backends as registered', () => {
      expect(isRegisteredRenderBackend('gpu')).toBe(true);
      expect(isRegisteredRenderBackend('cpu')).toBe(true);
      expect(isRegisteredRenderBackend('test:fancy')).toBe(true);
      expect(isRegisteredRenderBackend('auto')).toBe(false);
      expect(isRegisteredRenderBackend('turbo')).toBe(false);
    });

    it('adds a named constant on Enums.RenderBackends', () => {
      expect(RenderBackends.FANCY).toBe('test:fancy');
      expect(RenderBackends.GPU).toBe('gpu');
    });

    it('accepts the custom backend in setRenderBackend and resolves it as effective', () => {
      setRenderBackend(RenderBackends.FANCY);

      expect(getRenderBackend()).toBe('test:fancy');
      expect(getEffectiveRenderBackend()).toBe('test:fancy');
    });

    it('selects the custom image and volume render modes', () => {
      setRenderBackend('test:fancy');

      expect(service.select(IMAGE_DATASET).renderMode).toBe('test:fancyImage');
      expect(service.select(VOLUME_DATASET).renderMode).toBe(
        'test:fancyVolume'
      );
    });

    it('honors a per-mount custom backend pin over the global backend', () => {
      setRenderBackend('gpu');

      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'test:fancy',
      });

      expect(renderMode).toBe('test:fancyImage');
    });

    it('throws a descriptive error for volume datasets on an image-only backend', () => {
      setRenderBackend('test:imageOnly');

      expect(service.select(IMAGE_DATASET).renderMode).toBe(
        'test:imageOnlyImage'
      );
      expect(() => service.select(VOLUME_DATASET)).toThrow(
        /does not support volume-backed rendering/
      );
    });

    it('maps render modes back to their backend and surface', () => {
      expect(getRenderBackendForRenderMode('test:fancyImage')).toBe(
        'test:fancy'
      );
      expect(getRenderBackendForRenderMode(PlanarRenderModeId.VTK_FRAME)).toBe(
        'gpu'
      );
      expect(
        getRenderBackendForRenderMode(PlanarRenderModeId.CANVAS_CPU_SLICE)
      ).toBe('cpu');
      expect(getRenderBackendForRenderMode('unknown')).toBeUndefined();
      expect(getRenderSurfaceForRenderMode('test:fancyImage')).toBe('cpu');
      expect(getRenderSurfaceForRenderMode(PlanarRenderModeId.VTK_FRAME)).toBe(
        'vtk'
      );
      expect(getRenderSurfaceForRenderMode('unknown')).toBe('vtk');
    });

    it('injects the custom render paths into the default planar render paths', () => {
      const ids = createDefaultPlanarRenderPaths().map((path) => path.id);

      expect(ids).toContain('test:fancy-image-slice');
      expect(ids).toContain('planar:canvas-frame');
    });

    it('rejects duplicate backend ids, reserved ids and duplicate render modes', () => {
      expect(() =>
        registerRenderBackend({
          backend: 'test:fancy',
          renderModes: { frame: { id: 'test:other' } },
        })
      ).toThrow(/already registered/);
      expect(() =>
        registerRenderBackend({
          backend: 'auto',
          renderModes: { frame: { id: 'test:other' } },
        })
      ).toThrow(/reserved/);
      expect(() =>
        registerRenderBackend({
          backend: 'test:poacher',
          renderModes: { frame: { id: 'test:fancyImage' } },
        })
      ).toThrow(/already provided by render backend/);
      expect(() =>
        registerRenderBackend({
          backend: 'test:sameModes',
          renderModes: {
            frame: { id: 'test:same' },
            gpuVolume: { id: 'test:same' },
          },
        })
      ).toThrow(/distinct render modes/);
    });

    it('resets registrations and named constants for test isolation', () => {
      __resetRenderBackendRegistry();

      expect(isRegisteredRenderBackend('test:fancy')).toBe(false);
      expect(RenderBackends.FANCY).toBeUndefined();
      // Core backends re-register lazily on the next registry access.
      expect(isRegisteredRenderBackend('gpu')).toBe(true);
    });
  });
});
