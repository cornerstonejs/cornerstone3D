import { ActorRenderMode } from '../src/types';
import { Events, RenderBackend } from '../src/enums';
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
    setRenderBackend(RenderBackend.Auto);
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
      expect(getRenderBackend()).toBe(RenderBackend.Auto);
      expect(getEffectiveRenderBackend()).toBe(RenderBackend.GPU);

      setRenderBackend('cpu');

      expect(getRenderBackend()).toBe(RenderBackend.CPU);
      expect(getEffectiveRenderBackend()).toBe(RenderBackend.CPU);
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
      expect(getRenderBackend()).toBe(RenderBackend.CPU);
    });

    it('emits RENDER_BACKEND_CHANGED with previous/current/effective detail', () => {
      const listener = jest.fn();
      eventTarget.addEventListener(Events.RENDER_BACKEND_CHANGED, listener);

      setRenderBackend('cpu', 'unit-test');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail).toEqual({
        previous: RenderBackend.Auto,
        current: RenderBackend.CPU,
        effectiveBackend: RenderBackend.CPU,
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
        previous: RenderBackend.GPU,
        current: RenderBackend.CPU,
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
});
