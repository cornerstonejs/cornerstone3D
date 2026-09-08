import { ActorRenderMode } from '../src/types';
import {
  __resetRenderBackendRegistry,
  getRenderSurfaceForRenderMode,
  registerRenderBackend,
  renderModeSupportsOverlayActors,
  renderModeUsesVtkActors,
} from '../src/RenderingEngine/helpers/renderBackendRegistry';

describe('Render mode capabilities', () => {
  afterEach(() => {
    __resetRenderBackendRegistry();
  });

  describe('core render modes', () => {
    it('reports the gpu modes as vtk-actor based and overlay capable', () => {
      for (const renderMode of [
        ActorRenderMode.VTK_IMAGE,
        ActorRenderMode.VTK_VOLUME_SLICE,
      ]) {
        expect(renderModeUsesVtkActors(renderMode)).toBe(true);
        expect(renderModeSupportsOverlayActors(renderMode)).toBe(true);
      }
    });

    it('reports both cpu modes as non-vtk-actor based', () => {
      expect(renderModeUsesVtkActors(ActorRenderMode.CPU_IMAGE)).toBe(false);
      expect(renderModeUsesVtkActors(ActorRenderMode.CPU_VOLUME)).toBe(false);
    });

    it('allows overlays on cpuImage but not on cpuVolume', () => {
      // cpuImage composites overlay images through its CanvasActor; cpuVolume
      // writes slice pixels straight to the canvas and owns no container.
      expect(renderModeSupportsOverlayActors(ActorRenderMode.CPU_IMAGE)).toBe(
        true
      );
      expect(renderModeSupportsOverlayActors(ActorRenderMode.CPU_VOLUME)).toBe(
        false
      );
    });
  });

  describe('extension backends', () => {
    it('defaults both capabilities to true when undeclared', () => {
      registerRenderBackend({
        backend: 'test:default',
        renderModes: {
          image: { id: 'test:defaultImage' },
          volume: { id: 'test:defaultVolume' },
        },
      });

      for (const renderMode of ['test:defaultImage', 'test:defaultVolume']) {
        expect(renderModeUsesVtkActors(renderMode)).toBe(true);
        expect(renderModeSupportsOverlayActors(renderMode)).toBe(true);
      }
    });

    it('keeps overlay support independent of the composited surface', () => {
      // The case this capability exists for: a backend that blits its frames
      // into the cpu canvas while still mounting vtk actors. Keying overlay
      // support off the surface would silently drop its overlays.
      registerRenderBackend({
        backend: 'test:blitting',
        renderModes: {
          image: { id: 'test:blittingImage' },
          volume: { id: 'test:blittingVolume' },
        },
        surface: 'cpu',
      });

      expect(getRenderSurfaceForRenderMode('test:blittingVolume')).toBe('cpu');
      expect(renderModeSupportsOverlayActors('test:blittingVolume')).toBe(true);
      expect(renderModeUsesVtkActors('test:blittingVolume')).toBe(true);
    });

    it('honours a declared opt-out per render mode', () => {
      registerRenderBackend({
        backend: 'test:mixed',
        renderModes: {
          image: { id: 'test:mixedImage' },
          volume: {
            id: 'test:mixedVolume',
            supportsOverlayActors: false,
            usesVtkActors: false,
          },
        },
      });

      expect(renderModeSupportsOverlayActors('test:mixedImage')).toBe(true);
      expect(renderModeUsesVtkActors('test:mixedImage')).toBe(true);
      expect(renderModeSupportsOverlayActors('test:mixedVolume')).toBe(false);
      expect(renderModeUsesVtkActors('test:mixedVolume')).toBe(false);
    });
  });

  describe('unknown render modes', () => {
    it('treats an unregistered mode as capable, and undefined as not', () => {
      // An unregistered mode defaults to capable so that a mode the registry
      // has not been told about is not silently stripped of overlays; a
      // missing render mode means nothing is mounted at all.
      expect(renderModeSupportsOverlayActors('test:never-registered')).toBe(
        true
      );
      expect(renderModeUsesVtkActors('test:never-registered')).toBe(true);
      expect(renderModeSupportsOverlayActors(undefined)).toBe(false);
      expect(renderModeUsesVtkActors(undefined)).toBe(false);
    });
  });
});
