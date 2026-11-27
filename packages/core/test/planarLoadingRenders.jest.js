import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

function mockFakeActor() {
  return {
    getClassName: () => 'vtkImageSlice',
    getMapper: () => ({
      modified: jest.fn(),
      setScalarTexture: jest.fn(),
      getInputData: () => undefined,
      setSampleDistance: jest.fn(),
    }),
    getProperty: () => ({
      getRGBTransferFunction: () => ({ getRange: () => [0, 1] }),
    }),
    setVisibility: jest.fn(),
  };
}

jest.mock('../src/RenderingEngine/helpers/createVolumeSliceActor', () => ({
  __esModule: true,
  default: jest.fn(async () => ({ actor: mockFakeActor() })),
}));
jest.mock('../src/RenderingEngine/Viewports/setVtkCameraClippingRange', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { Events, ImageQualityStatus } from '../src/enums';
import eventTarget from '../src/eventTarget';
import { VtkGpuVolumeSliceRenderPath } from '../src/RenderingEngine/Viewports/Planar/VtkGpuVolumeSliceRenderPath';
import {
  PLANAR_LOADING_UPDATE_MS,
  createPlanarLoadingUpdates,
} from '../src/RenderingEngine/Viewports/Planar/planarLoadingUpdates';

/**
 * OHIF M94 (lane FX23): while a volume streams, the slab path of the 3D
 * texture (the MIP of the TMTV layout, a slab over the whole PET) asked for a
 * render at each delivery, which drew the MIP at every animation frame of the
 * load: 120 frames in OHIF against 56 on 5.18.3. A plane that reads most
 * frames now renders at the ticks of one clock that every loading picture
 * shares (`createPlanarLoadingUpdates`), so the layers and the panes that a
 * load changes draw in the same animation frame, and the end of the load
 * renders at once.
 */

const grid = {
  origin: [0, 0, 0],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  spacing: [1, 1, 1],
  dimensions: [16, 16, 8],
};

function streamingVolume(volumeId) {
  return {
    volumeId,
    voxelGrid: grid,
    imageIds: [],
    loadStatus: { loading: true },
    load: jest.fn(),
    getGridQuality: jest.fn((g) => ({
      grid: g,
      status: ImageQualityStatus.FAR_REPLICATE,
      voxels: 16 * 16 * 8,
      missing: 100,
      exact: true,
      source: 'clientDerived',
      reduction: 'boxAverage',
      deliveries: 0,
    })),
  };
}

function strategyOf(volume) {
  return {
    name: 'full',
    volume,
    isReady: () => true,
    bindings: () => [{ role: 'base', grid, statistic: 'average', texture: {} }],
    activate: () => undefined,
    deactivate: () => undefined,
    update: () => undefined,
  };
}

function context() {
  return {
    viewportId: 'vp-mip',
    viewport: {
      element: document.createElement('div'),
      getViewState: () => ({}),
    },
    view: {},
    display: { activateRenderMode: jest.fn(), requestRender: jest.fn() },
    vtk: {
      renderer: {
        addActor: jest.fn(),
        removeActor: jest.fn(),
        getActiveCamera: () => ({}),
        resetCameraClippingRange: jest.fn(),
        getActors: () => [],
        getVolumes: () => [{}],
      },
    },
  };
}

function send(type, volumeId) {
  eventTarget.dispatchEvent(new CustomEvent(type, { detail: { volumeId } }));
}

describe('The slab path of the 3D texture while its volume loads', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders once at the next tick of the shared clock for many deliveries, and at once at the end of the load', async () => {
    const volumeId = 'mip-volume';
    const volume = streamingVolume(volumeId);
    const path = new VtkGpuVolumeSliceRenderPath(() => [strategyOf(volume)]);
    const ctx = context();
    const attachment = await path.addData(
      ctx,
      { id: 'pt', type: 'image', volumeId, imageVolume: volume, imageIds: [] },
      { renderMode: 'any' }
    );

    ctx.display.requestRender.mockClear();

    for (let delivery = 0; delivery < 20; delivery++) {
      send(Events.IMAGE_VOLUME_MODIFIED, volumeId);
    }

    expect(ctx.display.requestRender).not.toHaveBeenCalled();

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS + 50);

    expect(ctx.display.requestRender).toHaveBeenCalledTimes(1);

    volume.loadStatus.loading = false;
    send(Events.IMAGE_VOLUME_LOADING_COMPLETED, volumeId);

    expect(ctx.display.requestRender).toHaveBeenCalledTimes(2);

    attachment.removeData();
  });
});

describe('The shared clock of the load updates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates two pictures that show something of the load and ask at different times in the same animation frame, at most once per tick each', () => {
    const times = { a: [], b: [] };
    const a = createPlanarLoadingUpdates(() => times.a.push(performance.now()));
    const b = createPlanarLoadingUpdates(() => times.b.push(performance.now()));

    a.soon();
    b.soon();
    jest.advanceTimersByTime(20);
    times.a.length = 0;
    times.b.length = 0;
    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS * 3 - 10);
    a.soon();
    jest.advanceTimersByTime(37);
    b.soon();
    a.soon();
    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS);

    expect(times.a.length).toBe(1);
    expect(times.b.length).toBe(1);
    expect(times.a[0]).toBe(times.b[0]);

    a.soon();
    b.soon();
    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS / 2);

    expect(times.a.length).toBe(1);

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS);

    expect(times.a.length).toBe(2);
    expect(times.a[1]).toBe(times.b[1]);
    expect(times.a[1] - times.a[0]).toBeGreaterThanOrEqual(
      PLANAR_LOADING_UPDATE_MS - 20
    );
  });
});

/**
 * OHIF M98 (lane FX24): a pane whose plane crosses the frames (sagittal,
 * coronal, the MIP) drew its first rows of a load at the next tick of the
 * shared clock, up to 100 ms after they arrived: 1,327 ms after the
 * navigation against 1,113 ms on 5.18.3 in OHIF's TMTV layout. The first
 * update that gives a picture something to show is drawn at the next
 * animation frame; the clock paces only the updates after it.
 */
describe('The first update of a load', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('comes at the next animation frame, and the clock paces the updates after it', () => {
    const times = [];
    const updates = createPlanarLoadingUpdates(() => {
      times.push(performance.now());
    });

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS * 5 + 10);

    const start = performance.now();

    updates.soon();
    jest.advanceTimersByTime(20);

    expect(times.length).toBe(1);
    expect(times[0] - start).toBeLessThan(PLANAR_LOADING_UPDATE_MS / 2);

    updates.soon();
    jest.advanceTimersByTime(20);

    expect(times.length).toBe(1);

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS);

    expect(times.length).toBe(2);
  });

  it('keeps coming at the next animation frame while the picture shows nothing of the load', () => {
    const shows = [false, false, true, true];
    let count = 0;
    const updates = createPlanarLoadingUpdates(() => shows[count++]);

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS * 7 + 10);

    for (let delivery = 0; delivery < 3; delivery++) {
      updates.soon();
      jest.advanceTimersByTime(20);
      expect(count).toBe(delivery + 1);
    }

    updates.soon();
    jest.advanceTimersByTime(20);

    expect(count).toBe(3);
  });

  it('renders the first delivery of a slab at the next animation frame, the next ones at the tick', async () => {
    const volumeId = 'mip-first-volume';
    const volume = streamingVolume(volumeId);
    const path = new VtkGpuVolumeSliceRenderPath(() => [strategyOf(volume)]);
    const ctx = context();
    const attachment = await path.addData(
      ctx,
      { id: 'pt', type: 'image', volumeId, imageVolume: volume, imageIds: [] },
      { renderMode: 'any' }
    );

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS * 9 + 5);
    ctx.display.requestRender.mockClear();
    send(Events.IMAGE_VOLUME_MODIFIED, volumeId);
    jest.advanceTimersByTime(20);

    expect(ctx.display.requestRender).toHaveBeenCalledTimes(1);

    for (let delivery = 0; delivery < 20; delivery++) {
      send(Events.IMAGE_VOLUME_MODIFIED, volumeId);
    }

    jest.advanceTimersByTime(20);

    expect(ctx.display.requestRender).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(PLANAR_LOADING_UPDATE_MS);

    expect(ctx.display.requestRender).toHaveBeenCalledTimes(2);

    attachment.removeData();
  });
});
