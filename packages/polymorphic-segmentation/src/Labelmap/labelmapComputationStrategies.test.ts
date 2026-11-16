import {
  convertContourToStackLabelmap,
  convertContourToVolumeLabelmap,
} from './convertContourToLabelmap';
import { computeLabelmapFromContourSegmentation } from './labelmapComputationStrategies';

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

  it('makes a volume labelmap for a legacy volume viewport', async () => {
    const viewport = { type: 'orthographic' };

    await computeLabelmapFromContourSegmentation('seg', {
      viewport: viewport as never,
    });

    expect(toVolume).toHaveBeenCalled();
    expect(toStack).not.toHaveBeenCalled();
  });

  it('makes a volume labelmap for a legacy adapter in volume mode', async () => {
    const viewport = {
      ...nextApi(),
      type: 'planarNext',
      requestedType: 'orthographic',
      getCurrentMode: () => 'volume',
    };

    await computeLabelmapFromContourSegmentation('seg', {
      viewport: viewport as never,
    });

    expect(toVolume).toHaveBeenCalled();
    expect(toStack).not.toHaveBeenCalled();
  });

  it('makes a stack labelmap for stack viewports, legacy or adapter', async () => {
    const viewports = [
      { type: 'stack' },
      {
        ...nextApi(),
        type: 'planarNext',
        requestedType: 'stack',
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
});
