jest.mock('../src/loaders/volumeLoader', () => ({
  __esModule: true,
  createAndCacheVolume: jest.fn(async (volumeId, { imageIds }) => ({
    volumeId,
    imageIds,
    load: jest.fn(),
  })),
}));

jest.mock('../src/loaders/geometryLoader', () => ({
  __esModule: true,
  loadAndCacheGeometry: jest.fn(async (geometryId) => ({ id: geometryId })),
}));

jest.mock('../src/utilities/VideoUtilities', () => ({
  __esModule: true,
  loadVideoStreamMetadata: jest.fn((imageId) => ({
    renderedUrl: `${imageId}/rendered`,
    cineRate: 25,
    numberOfFrames: 10,
    modality: 'XC',
    metadata: {},
  })),
}));

jest.mock('../src/RenderingEngine/Viewports/ECG/ecgWaveform', () => ({
  __esModule: true,
  loadECGWaveform: jest.fn(async (imageId) => ({
    waveform: { imageId, numberOfChannels: 12 },
  })),
}));

jest.mock('../src/utilities/WSIUtilities', () => ({
  __esModule: true,
  addWSIMiniNavigationOverlayCss: jest.fn(),
  loadWSIData: jest.fn(async ({ imageIds }) => ({
    volumeImages: [],
    metadataDicomweb: [],
    metadata: { imageIds },
    frameOfReferenceUID: '1.2.3',
    imageURISet: new Set(),
  })),
}));

import { ActorRenderMode } from '../src/types';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { DefaultPlanarDataProvider } from '../src/RenderingEngine/Viewports/Planar/DefaultPlanarDataProvider';
import { DefaultVolume3DDataProvider } from '../src/RenderingEngine/Viewports/Volume3D/DefaultVolume3DDataProvider';
import { DefaultVideoDataProvider } from '../src/RenderingEngine/Viewports/Video/DefaultVideoDataProvider';
import { DefaultECGDataProvider } from '../src/RenderingEngine/Viewports/ECG/DefaultECGDataProvider';
import { DefaultWSIDataProvider } from '../src/RenderingEngine/Viewports/WSI/DefaultWSIDataProvider';
import { loadVideoStreamMetadata } from '../src/utilities/VideoUtilities';
import { loadECGWaveform } from '../src/RenderingEngine/Viewports/ECG/ecgWaveform';
import { loadWSIData } from '../src/utilities/WSIUtilities';
import { loadAndCacheGeometry } from '../src/loaders/geometryLoader';

const imageIds = ['wadors:image-0', 'wadors:image-1'];
const webClient = { getDICOMwebMetadata: () => undefined };
const planarOptions = {
  orientation: 'acquisition',
  renderMode: ActorRenderMode.VTK_IMAGE,
  volumeId: undefined,
};

/**
 * The viewport family and the fields of the descriptor decide how the data
 * of a display set is loaded; a descriptor has no `kind`.
 */
describe('A display set descriptor without kind', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    displaySetRegistry.clear();
  });

  it('loads a planar display set from its image ids', async () => {
    displaySetRegistry.add('planar', {
      imageIds,
      image: { imageId: imageIds[0] },
    });

    const payload = await new DefaultPlanarDataProvider().load(
      'planar',
      planarOptions
    );

    expect(payload).toMatchObject({ id: 'planar', type: 'image', imageIds });
    expect(payload.image.imageId).toBe(imageIds[0]);
  });

  it('ignores a kind that an older descriptor still has', async () => {
    displaySetRegistry.add('old-kind', {
      imageIds,
      image: { imageId: imageIds[0] },
      kind: 'wsi',
    });

    const payload = await new DefaultPlanarDataProvider().load(
      'old-kind',
      planarOptions
    );

    expect(payload.imageIds).toEqual(imageIds);
  });

  it('loads the volume of a 3D display set from its image ids', async () => {
    displaySetRegistry.add('volume', { imageIds, volumeId: 'ct-volume' });

    const payload = await new DefaultVolume3DDataProvider().load('volume', {
      renderMode: 'vtkVolume3d',
    });

    expect(payload).toMatchObject({
      id: 'volume',
      type: 'image',
      imageIds,
      renderMode: 'vtkVolume3d',
    });
    expect(payload.volumeId).toContain('ct-volume');
  });

  it('loads the surface of a 3D display set from its geometry id', async () => {
    displaySetRegistry.add('surface', { geometryId: 'geometry-1' });

    const payload = await new DefaultVolume3DDataProvider().load('surface', {
      renderMode: 'vtkGeometry3d',
    });

    expect(loadAndCacheGeometry).toHaveBeenCalledWith('geometry-1', undefined);
    expect(payload).toMatchObject({
      id: 'surface',
      type: 'geometry',
      geometryId: 'geometry-1',
    });
  });

  it('loads a video from its image id', async () => {
    displaySetRegistry.add('video', { imageId: 'wadors:video' });

    const payload = await new DefaultVideoDataProvider().load('video');

    expect(loadVideoStreamMetadata).toHaveBeenCalledWith('wadors:video');
    expect(payload).toMatchObject({
      id: 'video',
      type: 'video',
      renderedUrl: 'wadors:video/rendered',
    });
  });

  it('loads a video by the id of the display set when nothing is registered', async () => {
    await new DefaultVideoDataProvider().load('wadors:unregistered-video');

    expect(loadVideoStreamMetadata).toHaveBeenCalledWith(
      'wadors:unregistered-video'
    );
  });

  it('loads an ECG waveform from its image id', async () => {
    displaySetRegistry.add('ecg', { imageId: 'wadors:ecg' });

    const payload = await new DefaultECGDataProvider().load('ecg');

    expect(loadECGWaveform.mock.calls[0][0]).toBe('wadors:ecg');
    expect(payload).toMatchObject({ id: 'ecg', type: 'ecg' });
  });

  it('loads a slide from its image ids and its web client', async () => {
    displaySetRegistry.add('slide', {
      imageIds,
      options: { webClient, miniNavigationOverlay: false },
    });

    const payload = await new DefaultWSIDataProvider().load('slide');

    expect(loadWSIData).toHaveBeenCalledWith({ imageIds, client: webClient });
    expect(payload).toMatchObject({ id: 'slide', type: 'wsi', imageIds });
  });

  it('loads a slide whose web client is the webClient of the descriptor', async () => {
    displaySetRegistry.add('slide-client', { imageIds, webClient });

    const payload = await new DefaultWSIDataProvider().load('slide-client');

    expect(payload.client).toBe(webClient);
  });
});

describe('A display set descriptor of the wrong shape for a viewport family', () => {
  afterEach(() => {
    displaySetRegistry.clear();
  });

  it('fails a planar mount without image ids, naming the field', async () => {
    displaySetRegistry.add('video-shaped', { imageId: 'wadors:video' });

    await expect(
      new DefaultPlanarDataProvider().load('video-shaped', planarOptions)
    ).rejects.toThrow(
      '[PlanarViewport] The display set "video-shaped" has no imageIds'
    );
  });

  it('fails a planar mount of an id that is not registered, naming the registry', async () => {
    await expect(
      new DefaultPlanarDataProvider().load('missing', planarOptions)
    ).rejects.toThrow(
      '[PlanarViewport] No display set is registered under "missing": register it with displaySetRegistry.add(displaySetId, descriptor)'
    );
  });

  it('fails a 3D volume without image ids, naming the field', async () => {
    displaySetRegistry.add('surface-shaped', { geometryId: 'geometry-1' });

    await expect(
      new DefaultVolume3DDataProvider().load('surface-shaped', {
        renderMode: 'vtkVolume3d',
      })
    ).rejects.toThrow(
      '[VolumeViewport3D] The display set "surface-shaped" has no imageIds'
    );
  });

  it('fails a 3D surface with neither image ids nor a geometry id', async () => {
    displaySetRegistry.add('ecg-shaped', { imageId: 'wadors:ecg' });

    await expect(
      new DefaultVolume3DDataProvider().load('ecg-shaped', {
        renderMode: 'vtkGeometry3d',
      })
    ).rejects.toThrow(
      '[VolumeViewport3D] The display set "ecg-shaped" has no imageIds or geometryId'
    );
    expect(loadAndCacheGeometry).not.toHaveBeenCalledWith(
      'ecg-shaped',
      undefined
    );
  });

  it('fails a video without an image id, naming the field', async () => {
    displaySetRegistry.add('stack-shaped', { imageIds });

    await expect(
      new DefaultVideoDataProvider().load('stack-shaped')
    ).rejects.toThrow(
      '[VideoViewport] The display set "stack-shaped" has no imageId'
    );
  });

  it('fails an ECG without an image id, naming the field', async () => {
    displaySetRegistry.add('stack-shaped', { imageIds });

    await expect(
      new DefaultECGDataProvider().load('stack-shaped')
    ).rejects.toThrow(
      '[ECGViewport] The display set "stack-shaped" has no imageId'
    );
  });

  it('fails a slide without a web client, naming what it needs', async () => {
    displaySetRegistry.add('no-client', { imageIds });

    await expect(
      new DefaultWSIDataProvider().load('no-client')
    ).rejects.toThrow(
      '[WSIViewport] The display set "no-client" has no imageIds with a web client'
    );
  });
});
