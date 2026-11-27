import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import StreamingImageVolume from '../src/cache/classes/StreamingImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';

/**
 * OHIF M94 (lane FX23): a streaming volume asked every rendering engine to
 * render each viewport that shows it at every 2% of its deliveries
 * (`autoLoad`), and once more at the end of its load. Each render path of a
 * viewport that shows a volume follows the deliveries itself
 * (`IMAGE_VOLUME_MODIFIED`, `IMAGE_VOLUME_LOADING_COMPLETED`) and asks for a
 * render only when its picture can have changed, so these renders drew and
 * copied pictures that had not changed: a sampled slice whose frames got
 * nothing, in every pane of the TMTV layout. The volume now asks for none.
 */

const engineId = 'streaming-load-renders-engine';
const dimensions = [4, 4, 8];

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
});

afterEach(() => {
  renderingEngineCache.delete(engineId);
});

function makeVolume(volumeId) {
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `image:${volumeId}:${k}`
  );
  const volume = new StreamingImageVolume(
    {
      volumeId,
      metadata: { FrameOfReferenceUID: 'for-1' },
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageIds,
      dataType: 'Uint16Array',
      numberOfComponents: 1,
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: new Uint16Array(4 * 4 * 8),
        numberOfComponents: 1,
      }),
    },
    {
      loadStatus: {
        loaded: false,
        loading: true,
        cancelled: false,
        callbacks: [],
      },
    }
  );

  volume.totalNumFrames = imageIds.length;

  return { volume, imageIds };
}

/** An engine with one viewport that shows the volume. */
function registerEngine(volumeId) {
  const engine = {
    id: engineId,
    hasBeenDestroyed: false,
    getViewports: () => [
      { id: 'shows-the-volume', hasVolumeId: (id) => id === volumeId },
    ],
    render: jest.fn(),
    renderViewport: jest.fn(),
    renderViewports: jest.fn(),
  };

  renderingEngineCache.set(engine);

  return engine;
}

describe('A streaming volume during its load', () => {
  it('asks no rendering engine to render the viewports that show it, and fires the events that they follow', async () => {
    const { volume, imageIds } = makeVolume('loadRenders');
    const engine = registerEngine(volume.volumeId);
    const events = [];
    const record = (evt) => {
      if (evt.detail?.volumeId === volume.volumeId) {
        events.push(evt.type);
      }
    };

    eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, record);
    eventTarget.addEventListener(Events.IMAGE_VOLUME_LOADING_COMPLETED, record);

    for (let index = 0; index < imageIds.length; index++) {
      volume.updateTextureAndTriggerEvents(
        index,
        imageIds[index],
        index % 2
          ? ImageQualityStatus.ADJACENT_REPLICATE
          : ImageQualityStatus.FULL_RESOLUTION
      );
      await Promise.resolve();
    }

    for (let index = 1; index < imageIds.length; index += 2) {
      volume.updateTextureAndTriggerEvents(
        index,
        imageIds[index],
        ImageQualityStatus.FULL_RESOLUTION
      );
      await Promise.resolve();
    }

    eventTarget.removeEventListener(Events.IMAGE_VOLUME_MODIFIED, record);
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      record
    );

    expect(volume.loadStatus.loaded).toBe(true);
    expect(engine.renderViewports).not.toHaveBeenCalled();
    expect(engine.renderViewport).not.toHaveBeenCalled();
    expect(engine.render).not.toHaveBeenCalled();
    expect(
      events.filter((type) => type === Events.IMAGE_VOLUME_MODIFIED).length
    ).toBe(imageIds.length + imageIds.length / 2);
    expect(events[events.length - 1]).toBe(
      Events.IMAGE_VOLUME_LOADING_COMPLETED
    );
  });
});
