import { imageLoader, volumeLoader } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  convertContourToStackLabelmap,
  convertContourToVolumeLabelmap,
} from './convertContourToLabelmap';
import { convertSurfaceToVolumeLabelmap } from './convertSurfaceToLabelmap';
import {
  computeLabelmapData,
  computeLabelmapFromContourSegmentation,
} from './labelmapComputationStrategies';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  volumeLoader: {
    createAndCacheDerivedLabelmapVolume: jest.fn(() => ({
      volumeId: 'derivedLabelmap',
    })),
    createAndCacheVolumeFromImages: jest.fn(() => ({
      volumeId: 'generatedSegmentationVolumeId',
    })),
  },
  imageLoader: {
    createAndCacheDerivedLabelmapImages: jest.fn(() => []),
  },
}));

jest.mock('@cornerstonejs/tools', () => ({
  utilities: {
    segmentation: {
      computeStackLabelmapFromVolume: jest.fn(),
      getUniqueSegmentIndices: jest.fn(() => [1]),
    },
  },
  segmentation: {
    state: {
      getSegmentation: jest.fn(() => ({
        representationData: { Contour: { annotationUIDsMap: new Map() } },
      })),
    },
  },
}));

jest.mock('./convertContourToLabelmap', () => ({
  convertContourToStackLabelmap: jest.fn(() => 'stack labelmap'),
  convertContourToVolumeLabelmap: jest.fn(() => 'volume labelmap'),
}));

jest.mock('./convertSurfaceToLabelmap', () => ({
  convertSurfaceToVolumeLabelmap: jest.fn(),
}));

const toVolume = convertContourToVolumeLabelmap as jest.Mock;
const toStack = convertContourToStackLabelmap as jest.Mock;

function nextApi() {
  return {
    setDisplaySets: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    setViewState: jest.fn(),
  };
}

describe('computeLabelmapFromContourSegmentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('makes a volume labelmap for a planar viewport in volume mode', async () => {
    const viewport = {
      ...nextApi(),
      type: 'planar',
      getCurrentMode: () => 'volume',
    };

    await computeLabelmapFromContourSegmentation('seg', {
      viewport: viewport as never,
    });

    expect(toVolume).toHaveBeenCalled();
    expect(toStack).not.toHaveBeenCalled();
  });

  it('makes a stack labelmap for viewports in stack mode', async () => {
    const viewports = [
      { getCurrentMode: () => 'stack' },
      {
        ...nextApi(),
        type: 'planar',
        getCurrentMode: () => 'stack',
      },
    ];

    for (const viewport of viewports) {
      await computeLabelmapFromContourSegmentation('seg', {
        viewport: viewport as never,
      });
    }

    expect(toStack).toHaveBeenCalledTimes(2);
    expect(toVolume).not.toHaveBeenCalled();
  });

  it('makes a volume labelmap for a 3D viewport with a mounted volume', async () => {
    const viewport = {
      ...nextApi(),
      type: 'volume3d',
      getCurrentMode: () => 'volume3d',
    };

    await computeLabelmapFromContourSegmentation('seg', {
      viewport: viewport as never,
    });

    expect(toVolume).toHaveBeenCalled();
    expect(toStack).not.toHaveBeenCalled();
  });
});

describe('computeLabelmapData from a Surface representation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives a volume labelmap from the volume of a 3D viewport with a mounted volume', async () => {
    const viewport = {
      ...nextApi(),
      type: 'volume3d',
      getCurrentMode: () => 'volume3d',
      getVolumeId: jest.fn(() => 'ct'),
      getImageIds: jest.fn(() => ['ct:0', 'ct:1']),
    };

    const surfaceSegmentation = {
      segmentationId: 'seg',
      representationData: {
        Surface: { geometryIds: new Map([[1, 'surface1']]) },
      },
    };

    (cornerstoneTools.segmentation.state.getSegmentation as jest.Mock)
      .mockReturnValueOnce(surfaceSegmentation)
      .mockReturnValueOnce(surfaceSegmentation);
    (convertSurfaceToVolumeLabelmap as jest.Mock).mockResolvedValueOnce({
      volumeId: 'derivedLabelmap',
    });

    await expect(
      computeLabelmapData('seg', { viewport: viewport as never })
    ).resolves.toEqual({ volumeId: 'derivedLabelmap' });

    expect(
      volumeLoader.createAndCacheDerivedLabelmapVolume
    ).toHaveBeenCalledWith('ct');
    expect(
      imageLoader.createAndCacheDerivedLabelmapImages
    ).not.toHaveBeenCalled();
    expect(
      cornerstoneTools.utilities.segmentation.computeStackLabelmapFromVolume
    ).not.toHaveBeenCalled();
  });
});
