jest.mock('../src/init', () => ({
  getConfiguration: jest.fn(),
  getShouldUseCPURendering: jest.fn(),
}));

jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../src/utilities/isValidVolume', () => ({
  isValidVolume: jest.fn(),
}));

jest.mock('../src/loaders/imageLoader', () => ({
  loadAndCacheImage: jest.fn(),
}));

jest.mock('../src/loaders/volumeLoader', () => ({
  createAndCacheVolume: jest.fn(),
}));

jest.mock('../src/utilities/VideoUtilities', () => ({
  loadVideoStreamMetadata: jest.fn(),
}));

jest.mock('../src/utilities/ECGUtilities', () => ({
  loadECGWaveform: jest.fn(),
}));

jest.mock('../src/utilities/WSIUtilities', () => ({
  addWSIMiniNavigationOverlayCss: jest.fn(),
  loadWSIData: jest.fn(),
}));

import cache from '../src/cache/cache';
import { OrientationAxis } from '../src/enums';
import { getConfiguration, getShouldUseCPURendering } from '../src/init';
import * as metaData from '../src/metaData';
import { loadAndCacheImage } from '../src/loaders/imageLoader';
import { createAndCacheVolume } from '../src/loaders/volumeLoader';
import { loadVideoStreamMetadata } from '../src/utilities/VideoUtilities';
import { loadECGWaveform } from '../src/utilities/ECGUtilities';
import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../src/utilities/WSIUtilities';
import { isValidVolume } from '../src/utilities/isValidVolume';
import {
  DefaultPlanarDataProvider,
  DefaultVideoDataProvider,
  DefaultECGDataProvider,
  DefaultWSIDataProvider,
} from '../src/RenderingEngine/ViewportV2';
import { CpuVolumeSliceRenderingAdapter } from '../src/RenderingEngine/ViewportV2/Planar/CpuVolumeSliceRenderingAdapter';
import {
  DEFAULT_PLANAR_CPU_VOXEL_THRESHOLD,
  selectPlanarRenderPath,
} from '../src/RenderingEngine/ViewportV2/Planar/planarRenderPathSelector';

const VIEWPORT_V2_DATA_SET = 'viewportV2DataSet';

describe('PlanarViewportV2 path selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getConfiguration.mockReturnValue({});
    getShouldUseCPURendering.mockReturnValue(false);
    isValidVolume.mockReturnValue(true);
    metaData.get.mockImplementation((type) => {
      if (type !== 'imagePlaneModule') {
        return undefined;
      }

      return {
        columns: 64,
        rows: 64,
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      };
    });
  });

  it('uses vtkImage for acquisition-aligned datasets below the CPU threshold', () => {
    const imageIds = ['image-1', 'image-2', 'image-3'];

    const result = selectPlanarRenderPath(
      {
        imageIds,
      },
      {
        orientation: OrientationAxis.AXIAL,
      }
    );

    expect(result.renderMode).toBe('vtkImage');
    expect(result.acquisitionOrientation).toBe(OrientationAxis.AXIAL);
    expect(result.volumeId).toBe(cache.generateVolumeId(imageIds));
  });

  it('uses cpu2d for acquisition-aligned datasets above the CPU threshold', () => {
    const result = selectPlanarRenderPath(
      {
        imageIds: new Array(64).fill('image').map((value, index) => {
          return `${value}-${index}`;
        }),
      },
      {
        cpuThresholds: {
          image: 100000,
        },
        orientation: OrientationAxis.AXIAL,
      }
    );

    expect(result.renderMode).toBe('cpu2d');
  });

  it('uses vtkVolume when the requested orientation differs from acquisition', () => {
    const result = selectPlanarRenderPath(
      {
        imageIds: ['image-1', 'image-2', 'image-3'],
      },
      {
        orientation: OrientationAxis.SAGITTAL,
      }
    );

    expect(result.renderMode).toBe('vtkVolume');
  });

  it('throws for non-acquisition requests that cannot form a valid volume', () => {
    isValidVolume.mockReturnValue(false);

    expect(() =>
      selectPlanarRenderPath(
        {
          imageIds: ['image-1', 'image-2', 'image-3'],
        },
        {
          orientation: OrientationAxis.SAGITTAL,
        }
      )
    ).toThrow(
      '[PlanarViewportV2] Non-acquisition rendering requires a valid volume dataset'
    );
  });
});

describe('DefaultPlanarDataProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    metaData.get.mockImplementation((type, dataId) => {
      if (type === VIEWPORT_V2_DATA_SET && dataId === 'ct-planar') {
        return {
          imageIds: ['image-1', 'image-2', 'image-3'],
          initialImageIdIndex: 1,
        };
      }
    });
  });

  it('loads only the initial image for slice rendering', async () => {
    const provider = new DefaultPlanarDataProvider();
    const image = { imageId: 'image-2' };

    loadAndCacheImage.mockResolvedValue(image);

    const data = await provider.load('ct-planar', {
      acquisitionOrientation: OrientationAxis.AXIAL,
      orientation: OrientationAxis.AXIAL,
      renderMode: 'vtkImage',
      volumeId: 'volume-1',
    });

    expect(loadAndCacheImage).toHaveBeenCalledWith('image-2');
    expect(createAndCacheVolume).not.toHaveBeenCalled();
    expect(data.type).toBe('image');
    expect(data.payload.initialImage).toBe(image);
  });

  it('creates or reuses a cached volume for volume rendering', async () => {
    const provider = new DefaultPlanarDataProvider();
    const volume = {
      imageIds: ['image-1', 'image-2', 'image-3'],
      load: jest.fn(),
    };

    metaData.get.mockImplementation((type, dataId) => {
      if (type === VIEWPORT_V2_DATA_SET && dataId === 'ct-planar') {
        return {
          imageIds: ['image-1', 'image-2', 'image-3'],
        };
      }
    });
    createAndCacheVolume.mockResolvedValue(volume);

    const data = await provider.load('ct-planar', {
      acquisitionOrientation: OrientationAxis.AXIAL,
      orientation: OrientationAxis.SAGITTAL,
      renderMode: 'vtkVolume',
      volumeId: 'volume-1',
    });

    expect(createAndCacheVolume).toHaveBeenCalledWith(
      'cornerstoneStreamingImageVolume:volume-1',
      {
        imageIds: ['image-1', 'image-2', 'image-3'],
      }
    );
    expect(data.type).toBe('image');
    expect(data.payload.imageVolume).toBe(volume);
  });
});

describe('CpuVolumeSliceRenderingAdapter', () => {
  it('does not force slice resampling when properties are replayed unchanged', () => {
    const adapter = new CpuVolumeSliceRenderingAdapter();
    const rendering = {
      runtime: {
        properties: {
          interpolationType: 'linear',
        },
        renderingInvalidated: false,
      },
    };

    adapter.updateProperties(undefined, rendering, {
      interpolationType: 'linear',
    });

    expect(rendering.runtime.renderingInvalidated).toBe(false);
  });

  it('does not force slice resampling when presentation is replayed', () => {
    const adapter = new CpuVolumeSliceRenderingAdapter();
    const rendering = {
      runtime: {
        presentation: {
          visible: true,
          opacity: 1,
        },
        renderingInvalidated: false,
      },
    };

    adapter.updatePresentation(undefined, rendering, {
      visible: true,
      opacity: 1,
    });

    expect(rendering.runtime.renderingInvalidated).toBe(false);
  });
});

describe('Other V2 default data providers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves video source ids from viewport dataset metadata', async () => {
    const provider = new DefaultVideoDataProvider();

    metaData.get.mockImplementation((type, dataId) => {
      if (type === VIEWPORT_V2_DATA_SET && dataId === 'video-demo') {
        return ['video-image-id'];
      }
    });
    loadVideoStreamMetadata.mockReturnValue({
      renderedUrl: 'blob:video',
      cineRate: 24,
      numberOfFrames: 10,
      modality: 'XC',
      metadata: { rows: 1, columns: 1 },
    });

    const data = await provider.load('video-demo');

    expect(loadVideoStreamMetadata).toHaveBeenCalledWith('video-image-id');
    expect(data.id).toBe('video-demo');
  });

  it('resolves ECG source ids from viewport dataset metadata', async () => {
    const provider = new DefaultECGDataProvider();

    metaData.get.mockImplementation((type, dataId) => {
      if (type === VIEWPORT_V2_DATA_SET && dataId === 'ecg-demo') {
        return ['ecg-image-id'];
      }
    });
    loadECGWaveform.mockResolvedValue({
      waveform: {
        channels: [],
        numberOfChannels: 0,
        numberOfSamples: 0,
        samplingFrequency: 100,
        bitsAllocated: 16,
        sampleInterpretation: 'SS',
      },
      calibration: undefined,
    });

    const data = await provider.load('ecg-demo');

    expect(loadECGWaveform).toHaveBeenCalledWith('ecg-image-id');
    expect(data.id).toBe('ecg-demo');
  });

  it('loads WSI datasets from viewport dataset metadata', async () => {
    const provider = new DefaultWSIDataProvider();
    const webClient = {};

    metaData.get.mockImplementation((type, dataId) => {
      if (type === VIEWPORT_V2_DATA_SET && dataId === 'wsi-demo') {
        return {
          imageIds: ['wsi-1', 'wsi-2'],
          options: {
            webClient,
          },
        };
      }
    });
    loadWSIData.mockResolvedValue({
      volumeImages: [],
      metadataDicomweb: [],
      metadata: {},
      frameOfReferenceUID: '1.2.3',
      imageURISet: new Set(['wsi-1', 'wsi-2']),
    });

    const data = await provider.load('wsi-demo');

    expect(addWSIMiniNavigationOverlayCss).toHaveBeenCalled();
    expect(loadWSIData).toHaveBeenCalledWith({
      imageIds: ['wsi-1', 'wsi-2'],
      client: webClient,
    });
    expect(data.id).toBe('wsi-demo');
  });
});
