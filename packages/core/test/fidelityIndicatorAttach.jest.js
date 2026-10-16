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
  isVolumeFidelityViewport,
  maybeAttachFidelityIndicator,
} from '../src/RenderingEngine/helpers/fidelityIndicator';
import { svgStateOf } from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
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
    getFidelityState: () => ({
      state: svgStateOf(lines),
      lines,
    }),
    notifyFidelityStateChanged: () => {},
  };
}

describe('fidelityIndicator attach gates', () => {
  const original = getConfiguration();

  afterEach(() => {
    setConfiguration(original);
  });

  describe('canReportFidelity / isVolumeFidelityViewport', () => {
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
        isVolumeFidelityViewport(
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
        isVolumeFidelityViewport(
          viewportStub({ type: ViewportType.VIDEO, canReport: false })
        )
      ).toBe(false);
    });
  });

  describe('isLabelmapActorEntry', () => {
    it('accepts representationUID or uid with a Labelmap segment', () => {
      expect(
        isLabelmapActorEntry({
          uid: 'actor-1',
          representationUID: 'seg-Labelmap-layer',
          actor: {},
        })
      ).toBe(true);
      expect(
        isLabelmapActorEntry({
          uid: 'seg-Labelmap-layer',
          actor: {},
        })
      ).toBe(true);
      expect(
        isLabelmapActorEntry({
          uid: 'actor-1',
          representationUID: 'Labelmap',
          actor: {},
        })
      ).toBe(true);
    });

    it('rejects normal volume actors', () => {
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
          uid: 'ct-volume',
          representationUID: 'MyLabelmapExtra',
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
    let getGridQuality;

    beforeEach(() => {
      jest.useFakeTimers();
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
      missing = 0;
      getGridQuality = jest.fn(() => ({
        grid: voxelGrid,
        status: ImageQualityStatus.FULL_RESOLUTION,
        lowest: ImageQualityStatus.FULL_RESOLUTION,
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
      viewport.getFidelityState = () => {
        const lines = fidelityLinesFromVolumeActors(viewport, records);
        return { state: svgStateOf(lines), lines };
      };
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

    it('announces done again after a later degradation', () => {
      const viewport = attach();
      const root = viewport.element.querySelector('.fi-root');
      const renderAs = (missingVoxels) => {
        missing = missingVoxels;
        invalidate(viewport);
        render(viewport);
      };

      renderAs(10);
      renderAs(0);
      expect(root.dataset.state).toBe('done');
      expect(root.dataset.shown).toBe('true');
      jest.advanceTimersByTime(1100);
      expect(root.dataset.shown).toBe('false');

      renderAs(10);
      expect(root.dataset.state).toBe('loading');
      renderAs(0);
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
});
