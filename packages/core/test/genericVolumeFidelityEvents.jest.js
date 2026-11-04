import { describe, it, expect, jest } from '@jest/globals';

// The actor helpers need WebGL. These fakes give the render paths an actor
// whose mapper and property they can call.
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
  };
}

jest.mock('../src/RenderingEngine/helpers/createVolumeSliceActor', () => ({
  __esModule: true,
  default: jest.fn(async () => ({ actor: mockFakeActor() })),
}));
jest.mock('../src/RenderingEngine/helpers/createVolumeActor', () => ({
  __esModule: true,
  default: jest.fn(async () => mockFakeActor()),
}));
jest.mock(
  '../src/RenderingEngine/GenericViewport/setVtkCameraClippingRange',
  () => ({
    __esModule: true,
    default: jest.fn(),
  })
);

import { Events, ImageQualityStatus } from '../src/enums';
import eventTarget from '../src/eventTarget';
import { VtkVolumeSliceRenderPath } from '../src/RenderingEngine/GenericViewport/Planar/VtkVolumeSliceRenderPath';
import { VtkVolume3DRenderPath } from '../src/RenderingEngine/GenericViewport/Volume3D/VtkVolume3DRenderPath';
import { svgStateOf } from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
import { fidelityLinesFromBindings } from '../src/RenderingEngine/helpers/fidelityIndicator/collectFidelityLines';

const fullGrid = {
  origin: [0, 0, 0],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  spacing: [1, 1, 1],
  dimensions: [64, 64, 8],
};
const reducedGrid = {
  ...fullGrid,
  spacing: [2, 2, 1],
  dimensions: [32, 32, 8],
};

/** A volume whose delivered quality the test changes between events. */
function streamingVolume(volumeId) {
  const volume = {
    volumeId,
    voxelGrid: fullGrid,
    imageIds: [],
    delivered: { lowest: undefined, missing: 32 * 32 * 8 },
    load: jest.fn(),
    getGridQuality: jest.fn((grid) => ({
      grid,
      status: ImageQualityStatus.FAR_REPLICATE,
      highest: volume.delivered.lowest,
      voxels: 32 * 32 * 8,
      exact: true,
      source: 'clientDerived',
      reduction: 'boxAverage',
      deliveries: 0,
      ...volume.delivered,
    })),
  };

  return volume;
}

function reducedStrategy(volume) {
  const texture = {};

  return {
    name: 'reduced',
    volume,
    isReady: () => true,
    bindings: () => [
      { role: 'base', grid: reducedGrid, statistic: 'average', texture },
    ],
    activate: () => undefined,
    deactivate: () => undefined,
    update: () => undefined,
  };
}

function context() {
  return {
    viewportId: 'vp-1',
    viewport: {
      element: document.createElement('div'),
      getViewState: () => ({}),
    },
    display: { activateRenderMode: jest.fn(), requestRender: jest.fn() },
    vtk: {
      renderer: {
        addActor: jest.fn(),
        removeActor: jest.fn(),
        addVolume: jest.fn(),
        removeVolume: jest.fn(),
        getActiveCamera: () => ({}),
        getActors: () => [],
        // A volume is already there, so the path keeps the camera.
        getVolumes: () => [{}],
      },
    },
  };
}

function sendVolumeEvent(type, volumeId) {
  eventTarget.dispatchEvent(new CustomEvent(type, { detail: { volumeId } }));
}

// One display pixel is 4 mm, so the 2 mm box average is lossless.
const display = { pixelSpacing: 4, viewPlaneNormal: [0, 0, 1] };

/** What the base class does when it reads the fidelity after a draw. */
function shownState(rendering) {
  rendering.refreshFidelity?.();

  return svgStateOf(
    fidelityLinesFromBindings(display, [
      { record: rendering.voxelQuality, fullGrid: rendering.fullGrid },
    ])
  );
}

describe.each([
  ['the slice render path', VtkVolumeSliceRenderPath, 'slice-volume'],
  ['the 3D render path', VtkVolume3DRenderPath, '3d-volume'],
])('%s and a streaming volume', (_name, RenderPath, volumeId) => {
  async function mount(options = {}) {
    const volume = streamingVolume(volumeId);
    const strategy = reducedStrategy(volume);
    const path = new RenderPath(() => [strategy]);
    const ctx = context();
    const attachment = await path.addData(
      ctx,
      {
        id: 'ds-1',
        type: 'image',
        volumeId,
        imageVolume: volume,
        imageIds: [],
      },
      { renderMode: 'any', ...options }
    );

    return { volume, ctx, attachment, strategy };
  }

  it('keeps the record of the bound texture after its texture set is evicted', async () => {
    const { volume, attachment, strategy } = await mount();
    const { rendering } = attachment;

    // The set offers no binding, but the mapper still draws the reduced
    // texture. The fake volume has no getVoxelQuality, so a full-composite
    // record would throw.
    strategy.bindings = () => [];
    volume.delivered = { lowest: ImageQualityStatus.LOSSY, missing: 0 };
    sendVolumeEvent(Events.IMAGE_VOLUME_MODIFIED, volumeId);

    expect(shownState(rendering)).toBe('lossy');
    expect(volume.getGridQuality).toHaveBeenLastCalledWith(
      reducedGrid,
      'average'
    );

    attachment.removeData();
  });

  it('updates the shown state from volume events with no camera change', async () => {
    const { volume, ctx, attachment } = await mount();
    const { rendering } = attachment;

    expect(shownState(rendering)).toBe('hidden');

    volume.delivered = {
      lowest: ImageQualityStatus.ADJACENT_REPLICATE,
      missing: 100,
    };
    sendVolumeEvent(Events.IMAGE_VOLUME_MODIFIED, volumeId);
    expect(ctx.display.requestRender).toHaveBeenCalled();
    expect(shownState(rendering)).toBe('loading');

    volume.delivered = { lowest: ImageQualityStatus.LOSSY, missing: 0 };
    sendVolumeEvent(Events.IMAGE_VOLUME_LOADING_COMPLETED, volumeId);
    expect(shownState(rendering)).toBe('lossy');

    attachment.removeData();
  });

  it('reads the quality once for many events before one draw', async () => {
    const { volume, attachment } = await mount();
    const { rendering } = attachment;

    shownState(rendering);
    volume.getGridQuality.mockClear();

    for (let i = 0; i < 20; i++) {
      sendVolumeEvent(Events.IMAGE_VOLUME_MODIFIED, volumeId);
    }
    expect(volume.getGridQuality).not.toHaveBeenCalled();

    shownState(rendering);
    shownState(rendering);
    expect(volume.getGridQuality).toHaveBeenCalledTimes(1);

    attachment.removeData();
  });

  it('excludes a segmentation overlay and reads no quality for its events', async () => {
    const volume = streamingVolume(volumeId);
    const path = new RenderPath(() => [reducedStrategy(volume)]);
    const attachment = await path.addData(
      context(),
      {
        id: 'seg-1',
        type: 'image',
        volumeId,
        imageVolume: volume,
        imageIds: [],
        reference: { kind: 'segmentation' },
      },
      { renderMode: 'any', role: 'overlay' }
    );
    const { rendering } = attachment;

    expect(rendering.excludeFromFidelity).toBe(true);
    volume.getGridQuality.mockClear();
    sendVolumeEvent(Events.IMAGE_VOLUME_MODIFIED, volumeId);
    rendering.refreshFidelity();
    expect(volume.getGridQuality).not.toHaveBeenCalled();

    attachment.removeData();
  });
});
