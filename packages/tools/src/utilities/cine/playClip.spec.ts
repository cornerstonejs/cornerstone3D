jest.mock('@cornerstonejs/core', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  return {
    Enums: {
      ViewportStatus: { RENDERED: 'rendered' },
    },
    cache: {
      getVolume: jest.fn(),
    },
    getEnabledElement: jest.fn(),
    utilities: {
      ...jest.requireActual(
        '../../../../core/src/utilities/viewportCapabilities'
      ),
      getVolumeViewportScrollInfo: jest.fn(() => ({
        numScrollSteps: 10,
        currentStepIndex: 0,
      })),
      logger: { toolsLog: { getLogger: jest.fn(() => logger) } },
      scroll: jest.fn(),
      triggerEvent: jest.fn(),
    },
  };
});

import { cache, getEnabledElement, utilities } from '@cornerstonejs/core';
import { playClip, stopClip } from './playClip';

const getVolumeMock = cache.getVolume as jest.Mock;
const getEnabledElementMock = getEnabledElement as jest.Mock;
const scrollMock = utilities.scroll as jest.Mock;

/**
 * A 4D volume of the cache with `numDimensionGroups` time points.
 */
function makeDynamicVolume(volumeId: string, numDimensionGroups = 5) {
  return {
    volumeId,
    numDimensionGroups,
    dimensionGroupNumber: 1,
    isDynamicVolume: () => true,
    scroll: jest.fn(),
  };
}

/**
 * A 3D volume of the cache.
 */
function makeStaticVolume(volumeId: string) {
  return {
    volumeId,
    isDynamicVolume: () => false,
  };
}

/**
 * A next viewport (`PlanarViewport` or its legacy adapter) with a source
 * volume. The legacy adapter also has `getAllVolumeIds`.
 */
function makeNextViewport(options: {
  id: string;
  volumeId?: string;
  mode?: string;
  legacyAdapter?: boolean;
}) {
  const viewport = {
    id: options.id,
    element: document.createElement('div'),
    setDisplaySets: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    setViewState: jest.fn(),
    getCurrentMode: jest.fn(() => options.mode ?? 'volume'),
    getVolumeId: jest.fn(() => options.volumeId),
    getNumberOfSlices: jest.fn(() => 20),
    getSliceIndex: jest.fn(() => 3),
    viewportStatus: 'rendered',
  } as Record<string, unknown>;

  if (options.legacyAdapter) {
    viewport.getAllVolumeIds = jest.fn(() =>
      options.volumeId ? [options.volumeId] : []
    );
  }

  return viewport;
}

function mountViewport(viewport: Record<string, unknown>) {
  getEnabledElementMock.mockImplementation((element) =>
    element === viewport.element
      ? { viewport, viewportId: viewport.id }
      : undefined
  );

  return viewport.element as HTMLDivElement;
}

function registerVolumes(...volumes: Array<{ volumeId: string }>) {
  const volumesById = new Map(
    volumes.map((volume) => [volume.volumeId, volume])
  );

  getVolumeMock.mockImplementation((volumeId) => volumesById.get(volumeId));
}

describe('playClip on next viewports', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays the time points of a 4D volume on a PlanarViewport', () => {
    const volume = makeDynamicVolume('dynamic-volume');
    const viewport = makeNextViewport({
      id: 'planar',
      volumeId: 'dynamic-volume',
    });
    const element = mountViewport(viewport);

    registerVolumes(volume);
    playClip(element, { framesPerSecond: 10 });
    jest.advanceTimersByTime(100);
    stopClip(element);

    expect(volume.scroll).toHaveBeenCalledWith(1);
    expect(scrollMock).not.toHaveBeenCalled();
  });

  it('plays the time points of a 4D volume on a legacy adapter viewport', () => {
    const volume = makeDynamicVolume('dynamic-volume');
    const viewport = makeNextViewport({
      id: 'adapter',
      volumeId: 'dynamic-volume',
      legacyAdapter: true,
    });
    const element = mountViewport(viewport);

    registerVolumes(volume);
    playClip(element, { framesPerSecond: 10 });
    jest.advanceTimersByTime(100);
    stopClip(element);

    expect(volume.scroll).toHaveBeenCalledWith(1);
    expect(scrollMock).not.toHaveBeenCalled();
  });

  it('starts again at the first time point after the last one', () => {
    const volume = makeDynamicVolume('dynamic-volume', 3);
    const viewport = makeNextViewport({
      id: 'planar-loop',
      volumeId: 'dynamic-volume',
    });
    const element = mountViewport(viewport);

    volume.dimensionGroupNumber = 3;
    registerVolumes(volume);
    playClip(element, { framesPerSecond: 10 });
    jest.advanceTimersByTime(100);
    stopClip(element);

    expect(volume.scroll).toHaveBeenCalledWith(-2);
  });

  it('scrolls slices of a 4D volume when 4D cine is off', () => {
    const volume = makeDynamicVolume('dynamic-volume');
    const viewport = makeNextViewport({
      id: 'planar-3d-cine',
      volumeId: 'dynamic-volume',
    });
    const element = mountViewport(viewport);

    registerVolumes(volume);
    playClip(element, { framesPerSecond: 10, dynamicCineEnabled: false });
    jest.advanceTimersByTime(100);
    stopClip(element);

    expect(volume.scroll).not.toHaveBeenCalled();
    expect(scrollMock).toHaveBeenCalledWith(viewport, {
      delta: 1,
      debounceLoading: true,
    });
  });

  it('scrolls slices of a 3D volume', () => {
    const viewport = makeNextViewport({
      id: 'planar-static',
      volumeId: 'static-volume',
    });
    const element = mountViewport(viewport);

    registerVolumes(makeStaticVolume('static-volume'));
    playClip(element, { framesPerSecond: 10 });
    jest.advanceTimersByTime(100);
    stopClip(element);

    expect(scrollMock).toHaveBeenCalledWith(viewport, {
      delta: 1,
      debounceLoading: true,
    });
  });

  it('scrolls images of a next viewport in stack mode', () => {
    const volume = makeDynamicVolume('dynamic-volume');
    const viewport = makeNextViewport({
      id: 'planar-stack',
      volumeId: 'dynamic-volume',
      mode: 'stack',
    });
    const element = mountViewport(viewport);

    registerVolumes(volume);
    playClip(element, { framesPerSecond: 10 });
    jest.advanceTimersByTime(100);
    stopClip(element);

    expect(volume.scroll).not.toHaveBeenCalled();
    expect(scrollMock).toHaveBeenCalled();
  });

  it('plays a next viewport that has no getNumberOfSlices as one step, and does not throw', () => {
    const viewport = makeNextViewport({ id: 'ecg', mode: 'ecg' });

    delete viewport.getNumberOfSlices;
    viewport.getSliceIndex = jest.fn(() => 0);

    const element = mountViewport(viewport);

    expect(() => {
      playClip(element, { framesPerSecond: 10, loop: true });
      jest.advanceTimersByTime(300);
      stopClip(element);
    }).not.toThrow();
    expect(scrollMock).not.toHaveBeenCalled();
  });
});
