import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { getConfiguration, setConfiguration } from '../src/init';
import cache from '../src/cache/cache';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import VoxelReductions from '../src/enums/VoxelReductions';
import ViewportType from '../src/enums/ViewportType';
import {
  attachFidelityIndicator,
  canReportFidelity,
  detachFidelityIndicator,
  isLabelmapActorEntry,
  maybeAttachFidelityIndicator,
} from '../src/RenderingEngine/helpers/fidelityIndicator';
import VolumeViewport3DNext from '../src/RenderingEngine/GenericViewport/Volume3D/viewport3D';
import GenericViewport from '../src/RenderingEngine/GenericViewport/GenericViewport';
import { fidelityLinesFromBindings } from '../src/RenderingEngine/helpers/fidelityIndicator/collectFidelityLines';

function viewportStub({
  type,
  getActors = true,
  canReport = true,
  lines = [],
} = {}) {
  const element = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'viewport-element';
  inner.style.overflow = 'hidden';
  element.appendChild(inner);

  return {
    id: 'vp-1',
    type,
    element,
    getActors: getActors ? () => [] : undefined,
    canReportFidelity: () => canReport,
    getFidelityLines: () => lines,
  };
}

describe('fidelityIndicator attach gates', () => {
  const original = getConfiguration();

  afterEach(() => {
    setConfiguration(original);
  });

  describe('canReportFidelity', () => {
    it('accepts viewports that declare canReportFidelity (volume and stack)', () => {
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.PLANAR_NEXT, canReport: true })
        )
      ).toBe(true);
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.PLANAR_NEXT, canReport: true })
        )
      ).toBe(true);
      expect(
        canReportFidelity(
          viewportStub({
            type: ViewportType.PLANAR_NEXT,
            canReport: true,
          })
        )
      ).toBe(true);
    });

    it('rejects viewports that cannot report fidelity', () => {
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.PLANAR_NEXT, canReport: false })
        )
      ).toBe(false);
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.VIDEO_NEXT, canReport: false })
        )
      ).toBe(false);
    });
  });

  describe('isLabelmapActorEntry', () => {
    it('accepts actors with excludeFromFidelity', () => {
      expect(
        isLabelmapActorEntry({
          uid: 'actor-1',
          excludeFromFidelity: true,
          actor: {},
        })
      ).toBe(true);
      expect(
        isLabelmapActorEntry({
          uid: 'actor-1',
          representationUID: 'seg-Labelmap-layer',
          excludeFromFidelity: true,
          actor: {},
        })
      ).toBe(true);
    });

    it('rejects actors without excludeFromFidelity, including Labelmap-shaped UIDs', () => {
      expect(
        isLabelmapActorEntry({
          uid: 'ct-volume',
          actor: {},
        })
      ).toBe(false);
      expect(
        isLabelmapActorEntry({
          uid: 'ct-volume',
          representationUID: 'fusion-ct',
          actor: {},
        })
      ).toBe(false);
      expect(
        isLabelmapActorEntry({
          uid: 'actor-1',
          representationUID: 'seg-Labelmap-layer',
          actor: {},
        })
      ).toBe(false);
      expect(
        isLabelmapActorEntry({
          uid: 'seg-Labelmap-layer',
          actor: {},
        })
      ).toBe(false);
    });
  });

  describe('dangerouslyDisableFidelityIndicator', () => {
    beforeEach(() => {
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: true,
      });
    });

    it('does not attach DOM when the product indicator is disabled', () => {
      const viewport = viewportStub({ type: ViewportType.PLANAR_NEXT });

      maybeAttachFidelityIndicator(viewport);

      expect(viewport.element.querySelector('.fi-root')).toBeNull();
      expect(
        viewport.element.querySelector('.viewport-element .fi-root')
      ).toBeNull();
    });
  });

  describe('overlay host', () => {
    beforeEach(() => {
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
    });

    it('mounts on the outer element so tooltips are not inside overflow:hidden', () => {
      const viewport = viewportStub({ type: ViewportType.PLANAR_NEXT });

      maybeAttachFidelityIndicator(viewport);

      const root = viewport.element.querySelector(':scope > .fi-root');
      expect(root).not.toBeNull();
      expect(
        viewport.element.querySelector('.viewport-element .fi-root')
      ).toBeNull();

      detachFidelityIndicator(viewport);
      expect(viewport.element.querySelector('.fi-root')).toBeNull();
    });

    it('restores inline position after detach', () => {
      const viewport = viewportStub({ type: ViewportType.PLANAR_NEXT });
      expect(viewport.element.style.position).toBe('');

      maybeAttachFidelityIndicator(viewport);
      expect(viewport.element.style.position).toBe('relative');

      detachFidelityIndicator(viewport);
      expect(viewport.element.style.position).toBe('');
    });
  });

  describe('attach replaces existing', () => {
    beforeEach(() => {
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
    });

    it('leaves a single .fi-root when attach follows the engine default', () => {
      const viewport = viewportStub({ type: ViewportType.PLANAR_NEXT });

      maybeAttachFidelityIndicator(viewport);
      const cleanup = attachFidelityIndicator(viewport);

      expect(viewport.element.querySelectorAll('.fi-root')).toHaveLength(1);

      cleanup();
      expect(viewport.element.querySelector('.fi-root')).toBeNull();
    });
  });

  describe('recovery', () => {
    const voxelGrid = {
      dimensions: [8, 8, 8],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
    let missing;
    let lowest;
    let getGridQuality;
    let loadStatus;

    beforeEach(() => {
      jest.useFakeTimers();
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
      missing = 0;
      lowest = ImageQualityStatus.FULL_RESOLUTION;
      loadStatus = { loading: false };
      getGridQuality = jest.fn(() => ({
        grid: voxelGrid,
        status: lowest,
        lowest,
        highest: ImageQualityStatus.FULL_RESOLUTION,
        missing,
        voxels: 512,
        exact: true,
        source: 'directLoad',
        reduction: VoxelReductions.None,
        deliveries: 1,
      }));
      jest
        .spyOn(cache, 'getVolume')
        .mockReturnValue({ voxelGrid, getGridQuality, loadStatus });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    function attach() {
      const viewport = viewportStub({ type: ViewportType.PLANAR_NEXT });
      viewport.getFidelityLines = () =>
        fidelityLinesFromBindings(undefined, [
          {
            record: getGridQuality(voxelGrid),
            fullGrid: voxelGrid,
            sampleDistanceIdle: 1,
            qualityPending: loadStatus.loading,
          },
        ]);
      maybeAttachFidelityIndicator(viewport);
      jest.advanceTimersByTime(20);
      return viewport;
    }

    function render(viewport) {
      viewport.element.dispatchEvent(new CustomEvent(Events.IMAGE_RENDERED));
      jest.advanceTimersByTime(20);
    }

    function invalidate() {
      eventTarget.dispatchEvent(
        new CustomEvent(Events.IMAGE_VOLUME_MODIFIED, {
          detail: { volumeId: 'vol' },
        })
      );
    }

    function renderAs(viewport, missingVoxels, quality) {
      missing = missingVoxels;
      lowest = quality;
      loadStatus.loading = missingVoxels > 0;
      invalidate();
      render(viewport);
    }

    it('shows no indicator for an ordinary load and its completion', () => {
      const viewport = attach();
      const root = viewport.element.querySelector('.fi-root');

      renderAs(viewport, 10, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.state).toBeUndefined();
      renderAs(viewport, 0, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.state).toBeUndefined();

      detachFidelityIndicator(viewport);
    });

    it('shows only the label, and removes it and its details on recovery', () => {
      const viewport = attach();
      const root = viewport.element.querySelector('.fi-root');
      const label = root.querySelector('.fi-label');

      renderAs(viewport, 10, ImageQualityStatus.LOSSY);
      expect(root.dataset.state).toBe('loading');
      expect(label.textContent).toBe('Transient Low Fidelity');
      expect([...root.children].map((child) => child.className)).toEqual([
        'fi-label',
        'fi-details',
      ]);

      root.dispatchEvent(new MouseEvent('mouseenter'));
      expect(root.dataset.hover).toBe('true');

      renderAs(viewport, 0, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.state).toBeUndefined();
      expect(label.textContent).toBe('');
      expect(root.dataset.hover).toBeUndefined();

      detachFidelityIndicator(viewport);
    });

    it('writes the label one time when the shown state does not change', () => {
      const viewport = attach();
      renderAs(viewport, 10, ImageQualityStatus.LOSSY);
      const label = viewport.element.querySelector('.fi-label');
      const { get, set } = Object.getOwnPropertyDescriptor(
        Node.prototype,
        'textContent'
      );
      const writes = [];
      Object.defineProperty(label, 'textContent', {
        get,
        set(value) {
          writes.push(value);
          set.call(this, value);
        },
      });

      for (let i = 0; i < 2; i++) {
        invalidate();
        viewport.element.dispatchEvent(
          new CustomEvent(Events.VIEWPORT_FIDELITY_CHANGED)
        );
        jest.advanceTimersByTime(20);
      }

      expect(writes).toEqual([]);
      expect(label.textContent).toBe('Transient Low Fidelity');
      detachFidelityIndicator(viewport);
    });
  });

  describe('generic viewports', () => {
    const fullGrid = {
      dimensions: [64, 64, 64],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };

    function quality(grid, reduction = VoxelReductions.BoxAverage) {
      return {
        grid,
        status: ImageQualityStatus.FULL_RESOLUTION,
        lowest: ImageQualityStatus.FULL_RESOLUTION,
        highest: ImageQualityStatus.FULL_RESOLUTION,
        missing: 0,
        voxels: 1,
        exact: true,
        source: 'clientDerived',
        reduction,
        deliveries: 1,
      };
    }

    // One CSS pixel is 2 mm; jsdom has devicePixelRatio 1.
    const resolvedView = {
      canvasToWorld: ([x, y]) => [2 * x, 2 * y, 0],
      worldToCanvas: () => [0, 0],
      toICamera: () => ({ viewPlaneNormal: [0, 0, 1] }),
      getFrameOfReferenceUID: () => '1.2.3',
    };

    class FidelityTestViewport extends GenericViewport {
      constructor(element, ...renderings) {
        super({ id: 'gvp-1', element });
        this.type = ViewportType.PLANAR_NEXT;
        this.renderingEngineId = 're-1';
        this.viewState = {};
        this.renderContext = { viewportId: 'gvp-1', type: 'planar' };
        this.dataProvider = {
          load: async (id) => ({ id, type: 'image' }),
        };
        this.renderPathResolver = {
          resolve: () => ({
            createRenderPath: () => ({
              addData: async () => ({
                rendering: renderings.shift(),
                removeData: () => {},
                applyViewState: () => {},
                updateDataPresentation: () => {},
                getFrameOfReferenceUID: () => '1.2.3',
              }),
            }),
          }),
        };
      }

      render() {}

      // A family that can show degradable data, as PlanarViewport.
      canReportFidelity() {
        return true;
      }

      getResolvedView() {
        return this.getDisplaySets().length ? resolvedView : undefined;
      }

      getCurrentMode() {
        return this.getDisplaySets().length ? 'volume' : 'empty';
      }

      normalizeViewState(viewState) {
        return viewState;
      }

      notifyDataPresentationModified() {}
    }

    beforeEach(() => {
      jest.useFakeTimers();
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function render(viewport) {
      viewport.notifyFidelityStateChanged();
      viewport.element.dispatchEvent(new CustomEvent(Events.IMAGE_RENDERED));
      jest.advanceTimersByTime(20);
    }

    it('attaches at enable and shows a lossy view that mounts later', async () => {
      const rendering = {
        renderMode: 'vtkVolumeSlice',
        voxelQuality: quality(
          { ...fullGrid, spacing: [2, 2, 1] },
          VoxelReductions.Decimation
        ),
        fullGrid,
        sampleDistanceLod: 1,
      };
      const viewport = new FidelityTestViewport(
        document.createElement('div'),
        rendering
      );

      // The engine attaches before any data is mounted.
      maybeAttachFidelityIndicator(viewport);
      const root = viewport.element.querySelector('.fi-root');
      expect(root).not.toBeNull();
      expect(root.dataset.state).toBeUndefined();

      await viewport.addDisplaySet('ds-1', { renderMode: 'vtkVolumeSlice' });
      render(viewport);

      expect(root.dataset.state).toBe('lossy');
      detachFidelityIndicator(viewport);
    });

    it('refreshes a stale record before it reads the fidelity', async () => {
      const rendering = {
        renderMode: 'vtkVolumeSlice',
        voxelQuality: quality(fullGrid, VoxelReductions.None),
        fullGrid,
        sampleDistanceLod: 1,
        // A volume event came; the next read must see the new record.
        fidelityStale: true,
        refreshFidelity: () => {
          rendering.fidelityStale = false;
          rendering.voxelQuality = quality(
            { ...fullGrid, spacing: [2, 2, 1] },
            VoxelReductions.Decimation
          );
        },
      };
      const viewport = new FidelityTestViewport(
        document.createElement('div'),
        rendering
      );
      await viewport.addDisplaySet('ds-1', { renderMode: 'vtkVolumeSlice' });

      expect(viewport.getFidelityState().lossy).toBe(true);
    });

    it('ignores a segmentation overlay that the render path excludes', async () => {
      const source = {
        renderMode: 'vtkVolumeSlice',
        voxelQuality: quality(fullGrid, VoxelReductions.None),
        fullGrid,
        sampleDistanceLod: 1,
      };
      // A decimated labelmap: lossy if it counted.
      const labelmap = {
        renderMode: 'vtkVolumeSlice',
        voxelQuality: quality(
          { ...fullGrid, spacing: [2, 2, 2] },
          VoxelReductions.Decimation
        ),
        fullGrid,
        sampleDistanceLod: 1,
        excludeFromFidelity: true,
      };
      const viewport = new FidelityTestViewport(
        document.createElement('div'),
        source,
        labelmap
      );

      await viewport.addDisplaySet('ds-1', { renderMode: 'vtkVolumeSlice' });
      await viewport.addDisplaySet('seg-1', {
        renderMode: 'vtkVolumeSlice',
        role: 'overlay',
      });

      expect(viewport.getFidelityState().lossy).toBe(false);
      labelmap.excludeFromFidelity = false;
      expect(viewport.getFidelityState().lossy).toBe(true);
    });

    it('reports a reduced to full texture upgrade once, then shows nothing', async () => {
      const rendering = {
        renderMode: 'vtkVolumeSlice',
        // A box average of 4 mm under 2 mm pixels.
        voxelQuality: quality({ ...fullGrid, spacing: [4, 4, 1] }),
        fullGrid,
        sampleDistanceLod: 1,
      };
      const viewport = new FidelityTestViewport(
        document.createElement('div'),
        rendering
      );
      const events = [];
      viewport.element.addEventListener(
        Events.VIEWPORT_FIDELITY_CHANGED,
        (evt) => events.push(evt.detail.state)
      );
      maybeAttachFidelityIndicator(viewport);
      await viewport.addDisplaySet('ds-1', { renderMode: 'vtkVolumeSlice' });
      const root = viewport.element.querySelector('.fi-root');

      render(viewport);
      expect(root.dataset.state).toBe('lossy');

      // The strategy binds the full-resolution texture.
      rendering.voxelQuality = quality(fullGrid, VoxelReductions.None);
      render(viewport);
      expect(root.dataset.state).toBeUndefined();

      render(viewport);
      expect(events.map((state) => state.shownState)).toEqual([
        'lossy',
        'done',
      ]);
      detachFidelityIndicator(viewport);
    });
  });

  describe('VOLUME_3D_NEXT viewport', () => {
    it('reports fidelity and uses the 3D display spacing on every axis', () => {
      const full = {
        dimensions: [64, 64, 64],
        spacing: [1, 1, 1],
        origin: [0, 0, 0],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      };
      const reduced = { ...full, dimensions: [64, 64, 32], spacing: [1, 1, 2] };
      const binding = {
        role: 'source',
        data: {},
        rendering: {
          renderMode: 'vtkVolume3d',
          fullGrid: full,
          sampleDistanceLod: 1,
          voxelQuality: {
            grid: reduced,
            status: ImageQualityStatus.FULL_RESOLUTION,
            lowest: ImageQualityStatus.FULL_RESOLUTION,
            highest: ImageQualityStatus.FULL_RESOLUTION,
            missing: 0,
            voxels: 64 * 64 * 32,
            exact: true,
            source: 'clientDerived',
            reduction: VoxelReductions.BoxAverage,
            deliveries: 1,
          },
        },
      };
      // The prototype without the constructor, which needs a renderer. The
      // resolved view is the public seam for the display (2 mm per pixel).
      const viewport = Object.assign(
        Object.create(VolumeViewport3DNext.prototype),
        {
          bindings: new Map([['ds', binding]]),
          getResolvedView: () => ({
            canvasToWorld: ([x, y]) => [2 * x, 2 * y, 0],
            toICamera: () => ({ viewPlaneNormal: [0, 0, 1] }),
          }),
        }
      );

      expect(viewport.getCurrentMode()).toBe('volume3d');
      expect(canReportFidelity(viewport)).toBe(true);

      const state = viewport.getFidelityState();
      expect(state.displayResolution.spacing).toEqual([2, 2, 2]);
      expect(state.lossy).toBe(false);
    });
  });
});
