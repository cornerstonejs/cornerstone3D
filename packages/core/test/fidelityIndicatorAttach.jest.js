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
import VoxelStatistics from '../src/enums/VoxelStatistics';
import ViewportType from '../src/enums/ViewportType';
import {
  attachFidelityIndicator,
  canReportFidelity,
  detachFidelityIndicator,
  isLabelmapActorEntry,
  maybeAttachFidelityIndicator,
} from '../src/RenderingEngine/helpers/fidelityIndicator';
import { DONE_HOLD_MS } from '../src/RenderingEngine/helpers/fidelityIndicator/attachFidelityIndicator';
import BaseVolumeViewport from '../src/RenderingEngine/BaseVolumeViewport';
import VolumeViewport3DNext from '../src/RenderingEngine/GenericViewport/Volume3D/viewport3D';
import GenericViewport from '../src/RenderingEngine/GenericViewport/GenericViewport';
import { fidelityLinesFromVolumeActors } from '../src/RenderingEngine/helpers/fidelityIndicator/collectFidelityLines';

function viewportStub({
  type,
  requestedType,
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
    requestedType,
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
          viewportStub({ type: ViewportType.ORTHOGRAPHIC, canReport: true })
        )
      ).toBe(true);
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.STACK, canReport: true })
        )
      ).toBe(true);
      expect(
        canReportFidelity(
          viewportStub({
            type: ViewportType.PLANAR_NEXT,
            requestedType: ViewportType.STACK,
            canReport: true,
          })
        )
      ).toBe(true);
    });

    it('rejects viewports that cannot report fidelity', () => {
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.STACK, canReport: false })
        )
      ).toBe(false);
      expect(
        canReportFidelity(
          viewportStub({ type: ViewportType.VIDEO, canReport: false })
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

  describe('fidelityLinesFromVolumeActors statistic', () => {
    const voxelGrid = {
      dimensions: [4, 4, 4],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('uses the bound texture statistic over volume.reductionStatistic', () => {
      const getGridQuality = jest.fn(() => ({
        grid: voxelGrid,
        status: ImageQualityStatus.FULL_RESOLUTION,
        lowest: ImageQualityStatus.FULL_RESOLUTION,
        highest: ImageQualityStatus.FULL_RESOLUTION,
        missing: 0,
        voxels: 64,
        exact: true,
        source: 'directLoad',
        reduction: VoxelReductions.None,
        deliveries: 1,
      }));

      jest.spyOn(cache, 'getVolume').mockReturnValue({
        voxelGrid,
        reductionStatistic: VoxelStatistics.Average,
        getGridQuality,
      });

      const viewport = {
        type: ViewportType.ORTHOGRAPHIC,
        getActors: () => [
          {
            uid: 'vol',
            referencedId: 'vol',
            actor: {
              getMapper: () => ({
                getScalarTexture: () => ({
                  getGrid: () => voxelGrid,
                  getStatistic: () => VoxelStatistics.ForegroundMajority,
                }),
              }),
            },
          },
        ],
      };

      fidelityLinesFromVolumeActors(viewport);

      expect(getGridQuality).toHaveBeenCalledWith(
        voxelGrid,
        VoxelStatistics.ForegroundMajority
      );
    });

    it('falls back to volume.reductionStatistic when the texture has no statistic', () => {
      const getGridQuality = jest.fn(() => ({
        grid: voxelGrid,
        status: ImageQualityStatus.FULL_RESOLUTION,
        lowest: ImageQualityStatus.FULL_RESOLUTION,
        highest: ImageQualityStatus.FULL_RESOLUTION,
        missing: 0,
        voxels: 64,
        exact: true,
        source: 'directLoad',
        reduction: VoxelReductions.None,
        deliveries: 1,
      }));

      jest.spyOn(cache, 'getVolume').mockReturnValue({
        voxelGrid,
        reductionStatistic: VoxelStatistics.Average,
        getGridQuality,
      });

      const viewport = {
        type: ViewportType.ORTHOGRAPHIC,
        getActors: () => [
          {
            uid: 'vol',
            referencedId: 'vol',
            actor: {
              getMapper: () => ({
                getScalarTexture: () => ({
                  getGrid: () => voxelGrid,
                }),
              }),
            },
          },
        ],
      };

      fidelityLinesFromVolumeActors(viewport);

      expect(getGridQuality).toHaveBeenCalledWith(
        voxelGrid,
        VoxelStatistics.Average
      );
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
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });

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
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });

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
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });
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
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });

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

    beforeEach(() => {
      jest.useFakeTimers();
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
      missing = 0;
      lowest = ImageQualityStatus.FULL_RESOLUTION;
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
        .mockReturnValue({ voxelGrid, getGridQuality });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    function attach() {
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });
      const records = new Map();
      viewport.getActors = () => [{ uid: 'vol', actor: {} }];
      viewport.getFidelityLines = () =>
        fidelityLinesFromVolumeActors(viewport, records);
      viewport._fidelityRecords = records;
      maybeAttachFidelityIndicator(viewport);
      jest.advanceTimersByTime(20);
      return viewport;
    }

    function render(viewport) {
      viewport.element.dispatchEvent(new CustomEvent(Events.IMAGE_RENDERED));
      jest.advanceTimersByTime(20);
    }

    function invalidate(viewport) {
      viewport._fidelityRecords.delete('vol');
      eventTarget.dispatchEvent(
        new CustomEvent(Events.IMAGE_VOLUME_MODIFIED, {
          detail: { volumeId: 'vol' },
        })
      );
    }

    function renderAs(viewport, missingVoxels, quality) {
      missing = missingVoxels;
      lowest = quality;
      invalidate(viewport);
      render(viewport);
    }

    it('shows no indicator for an ordinary load and its completion', () => {
      const viewport = attach();
      const root = viewport.element.querySelector('.fi-root');

      renderAs(viewport, 10, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.shown).toBe('false');
      renderAs(viewport, 0, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.state).toBeUndefined();
      expect(root.dataset.shown).toBe('false');

      detachFidelityIndicator(viewport);
    });

    it('announces done again after a later degradation', () => {
      const viewport = attach();
      const root = viewport.element.querySelector('.fi-root');

      renderAs(viewport, 10, ImageQualityStatus.LOSSY);
      expect(root.dataset.state).toBe('loading');
      renderAs(viewport, 0, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.state).toBe('done');
      expect(root.dataset.shown).toBe('true');
      jest.advanceTimersByTime(DONE_HOLD_MS + 100);
      expect(root.dataset.shown).toBe('false');

      renderAs(viewport, 10, ImageQualityStatus.ADJACENT_REPLICATE);
      expect(root.dataset.state).toBe('loading');
      renderAs(viewport, 0, ImageQualityStatus.FULL_RESOLUTION);
      expect(root.dataset.state).toBe('done');
      expect(root.dataset.shown).toBe('true');

      detachFidelityIndicator(viewport);
    });

    it('reads the quality record again only when the volume data changes', () => {
      const viewport = attach();
      render(viewport);
      render(viewport);
      expect(getGridQuality).toHaveBeenCalledTimes(1);

      invalidate(viewport);
      render(viewport);
      expect(getGridQuality).toHaveBeenCalledTimes(2);

      detachFidelityIndicator(viewport);
    });
  });

  describe('BaseVolumeViewport record listeners', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function volumeViewport(element) {
      // The prototype without the constructor, which needs WebGL. The public
      // getFidelityLines() adds the listeners.
      return Object.assign(Object.create(BaseVolumeViewport.prototype), {
        id: 'vp-1',
        element,
        isDisabled: false,
        getActors: () => [],
        _fidelityRecords: new Map(),
      });
    }

    function disable(element) {
      eventTarget.dispatchEvent(
        new CustomEvent(Events.ELEMENT_DISABLED, {
          detail: { element, viewportId: 'vp-1' },
        })
      );
    }

    it('removes its global listeners on ELEMENT_DISABLED and never adds them again', () => {
      const add = jest.spyOn(eventTarget, 'addEventListener');
      const remove = jest.spyOn(eventTarget, 'removeEventListener');
      const element = document.createElement('div');
      const viewport = volumeViewport(element);

      viewport.getFidelityLines();
      const added = add.mock.calls.map(([type, fn]) => [type, fn]);
      // IMAGE_VOLUME_MODIFIED, IMAGE_VOLUME_LOADING_COMPLETED, ELEMENT_DISABLED.
      expect(added).toHaveLength(3);

      // Same viewport id, other element (another rendering engine).
      disable(document.createElement('div'));
      expect(remove).not.toHaveBeenCalled();

      // `_reset` fires the event and leaves `isDisabled` false.
      disable(element);
      expect(remove.mock.calls.map(([type, fn]) => [type, fn])).toEqual(added);

      add.mockClear();
      viewport.getFidelityLines();
      expect(add).not.toHaveBeenCalled();
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
      expect(root.dataset.shown).toBe('false');

      await viewport.addDisplaySet('ds-1', { renderMode: 'vtkVolumeSlice' });
      render(viewport);

      expect(root.dataset.state).toBe('lossy');
      expect(root.dataset.shown).toBe('true');
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
      expect(root.dataset.state).toBe('done');
      expect(root.dataset.shown).toBe('true');
      jest.advanceTimersByTime(DONE_HOLD_MS + 100);
      expect(root.dataset.shown).toBe('false');

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
      // Standing box average of a coarser grid is lossy at every magnification.
      expect(state.lossy).toBe(true);
    });
  });
});
