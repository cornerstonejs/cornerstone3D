import { ActorRenderMode } from '../src/types';
import { Events, RenderBackends } from '../src/enums';
import {
  getEffectiveRenderBackend,
  getRenderBackend,
  isCornerstoneInitialized,
  resetInitialization,
  setRenderBackend,
  setUseCPURendering,
} from '../src/init';
import eventTarget from '../src/eventTarget';
import cache from '../src/cache/cache';
import { PlanarRenderPathDecisionService } from '../src/RenderingEngine/GenericViewport/Planar/PlanarRenderPathDecisionService';
import {
  __resetRenderBackendRegistry,
  getRenderBackendForRenderMode,
  getRenderSurfaceForRenderMode,
  isRegisteredRenderBackend,
  registerRenderBackend,
} from '../src/RenderingEngine/helpers/renderBackendRegistry';
import { createDefaultPlanarRenderPaths } from '../src/RenderingEngine/GenericViewport/Planar/PlanarRenderPathResolver';

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
    setUseCPURendering(false, false);
    setRenderBackend(RenderBackends.Auto);
    eventTarget.reset();
  });

  describe('image path', () => {
    it('selects the GPU image path by default (auto, no CPU flag)', () => {
      const { renderMode } = service.select(IMAGE_DATASET);
      expect(renderMode).toBe(ActorRenderMode.VTK_IMAGE);
    });

    it('selects the CPU image path when the global backend is pinned to cpu', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(IMAGE_DATASET);
      expect(renderMode).toBe(ActorRenderMode.CPU_IMAGE);
    });

    it('honors the deprecated useCPURendering flag under auto', () => {
      setUseCPURendering(true, false);
      const { renderMode } = service.select(IMAGE_DATASET);
      expect(renderMode).toBe(ActorRenderMode.CPU_IMAGE);
    });

    it('lets a global gpu pin win over the deprecated CPU flag', () => {
      setUseCPURendering(true, false);
      setRenderBackend('gpu');
      const { renderMode } = service.select(IMAGE_DATASET);
      expect(renderMode).toBe(ActorRenderMode.VTK_IMAGE);
    });

    it('lets a per-mount cpu pin win over a global gpu pin', () => {
      setRenderBackend('gpu');
      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'cpu',
      });
      expect(renderMode).toBe(ActorRenderMode.CPU_IMAGE);
    });

    it('lets a per-mount gpu pin win over a global cpu pin', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'gpu',
      });
      expect(renderMode).toBe(ActorRenderMode.VTK_IMAGE);
    });

    it('resolves a per-mount auto from capability detection even under a global cpu pin', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(IMAGE_DATASET, {
        renderBackend: 'auto',
      });
      expect(renderMode).toBe(ActorRenderMode.VTK_IMAGE);
    });
  });

  describe('volume path', () => {
    it('selects the GPU volume slice path by default', () => {
      const { renderMode } = service.select(VOLUME_DATASET);
      expect(renderMode).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    });

    it('honors a per-mount cpu pin for volume datasets', () => {
      const { renderMode } = service.select(VOLUME_DATASET, {
        renderBackend: 'cpu',
      });
      expect(renderMode).toBe(ActorRenderMode.CPU_VOLUME);
    });

    it('honors a per-mount gpu pin over a global cpu pin for volume datasets', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(VOLUME_DATASET, {
        renderBackend: 'gpu',
      });
      expect(renderMode).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    });

    it('selects the CPU volume path with a global cpu pin', () => {
      setRenderBackend('cpu');
      const { renderMode } = service.select(VOLUME_DATASET);
      expect(renderMode).toBe(ActorRenderMode.CPU_VOLUME);
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

    it('emits when the deprecated setUseCPURendering changes the effective backend', () => {
      const listener = jest.fn();
      eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, listener);

      setUseCPURendering(true);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail).toMatchObject({
        previous: RenderBackends.GPU,
        current: RenderBackends.CPU,
        reason: 'setUseCPURendering',
      });

      eventTarget.removeEventListener(Events.RENDER_BACKEND_CHANGED, listener);
    });

    it('does not emit for setUseCPURendering under an explicit gpu pin', () => {
      setRenderBackend('gpu');

      const listener = jest.fn();
      eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, listener);

      setUseCPURendering(true);

      expect(listener).not.toHaveBeenCalled();
      eventTarget.removeEventListener(Events.RENDER_BACKEND_CHANGED, listener);
    });
  });

  describe('registered custom backends', () => {
    const fancyRenderPath = {
      id: 'test:fancy-image-slice',
      type: 'planarNext',
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
          image: {
            id: 'test:fancyImage',
            createDefinition: () => fancyRenderPath,
          },
          volume: { id: 'test:fancyVolume' },
        },
        surface: 'cpu',
      });
      registerRenderBackend({
        backend: 'test:imageOnly',
        renderModes: { image: { id: 'test:imageOnlyImage' } },
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
      expect(getRenderBackendForRenderMode(ActorRenderMode.VTK_IMAGE)).toBe(
        'gpu'
      );
      expect(getRenderBackendForRenderMode(ActorRenderMode.CPU_VOLUME)).toBe(
        'cpu'
      );
      expect(getRenderBackendForRenderMode('unknown')).toBeUndefined();
      expect(getRenderSurfaceForRenderMode('test:fancyImage')).toBe('cpu');
      expect(getRenderSurfaceForRenderMode(ActorRenderMode.VTK_IMAGE)).toBe(
        'vtk'
      );
      expect(getRenderSurfaceForRenderMode('unknown')).toBe('vtk');
    });

    it('injects the custom render paths into the default planar render paths', () => {
      const ids = createDefaultPlanarRenderPaths().map((path) => path.id);

      expect(ids).toContain('test:fancy-image-slice');
      expect(ids).toContain('planar:cpu-image-slice');
    });

    it('rejects duplicate backend ids, reserved ids and duplicate render modes', () => {
      expect(() =>
        registerRenderBackend({
          backend: 'test:fancy',
          renderModes: { image: { id: 'test:other' } },
        })
      ).toThrow(/already registered/);
      expect(() =>
        registerRenderBackend({
          backend: 'auto',
          renderModes: { image: { id: 'test:other' } },
        })
      ).toThrow(/reserved/);
      expect(() =>
        registerRenderBackend({
          backend: 'test:poacher',
          renderModes: { image: { id: 'test:fancyImage' } },
        })
      ).toThrow(/already provided by render backend/);
      expect(() =>
        registerRenderBackend({
          backend: 'test:sameModes',
          renderModes: {
            image: { id: 'test:same' },
            volume: { id: 'test:same' },
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
