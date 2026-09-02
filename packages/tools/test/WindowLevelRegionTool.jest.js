const mockGetEnabledElement = jest.fn();
const mockExtractWindowLevelRegionToolData = jest.fn();
const mockGetLuminanceFromRegion = jest.fn();
const mockCalculateMinMaxMean = jest.fn();
const mockToLowHighRange = jest.fn();

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    getEnabledElement: (...args) => mockGetEnabledElement(...args),
    utilities: {
      ...actual.utilities,
      clip: (value, min, max) => Math.min(Math.max(value, min), max),
      windowLevel: {
        ...actual.utilities.windowLevel,
        toLowHighRange: (...args) => mockToLowHighRange(...args),
      },
      viewportSupportsDisplaySetPresentation: jest.fn(() => false),
    },
  };
});

jest.mock('../src/utilities/voi', () => ({
  windowLevel: {
    extractWindowLevelRegionToolData: (...args) =>
      mockExtractWindowLevelRegionToolData(...args),
    getLuminanceFromRegion: (...args) => mockGetLuminanceFromRegion(...args),
    calculateMinMaxMean: (...args) => mockCalculateMinMaxMean(...args),
  },
}));

const WindowLevelRegionTool =
  require('../src/tools/WindowLevelRegionTool').default;

describe('WindowLevelRegionTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses image-space ROI sampling (not canvas-space) when applying window/level region', () => {
    const viewport = {
      worldToCanvas: jest.fn((world) => [world[0] * 20, world[1] * 20]),
      getProperties: jest.fn(() => ({})),
      setProperties: jest.fn(),
      render: jest.fn(),
    };
    const imageData = {
      width: 256,
      height: 256,
      minPixelValue: 0,
      maxPixelValue: 255,
      worldToImage: jest
        .fn()
        .mockReturnValueOnce([10, 20])
        .mockReturnValueOnce([40, 60]),
    };
    const annotation = {
      data: {
        handles: {
          points: [
            [5, 5, 0],
            [5, 5, 0],
            [5, 5, 0],
            [10, 10, 0],
          ],
        },
      },
    };

    mockGetEnabledElement.mockReturnValue({ viewport });
    mockExtractWindowLevelRegionToolData.mockReturnValue(imageData);
    mockGetLuminanceFromRegion.mockReturnValue([11, 12, 13]);
    mockCalculateMinMaxMean.mockReturnValue({ min: 100, max: 102, mean: 101 });
    mockToLowHighRange.mockReturnValue({ lower: 96, upper: 106 });

    const tool = new WindowLevelRegionTool();
    tool.applyWindowLevelRegion(annotation, {});

    expect(imageData.worldToImage).toHaveBeenCalledTimes(2);
    expect(viewport.worldToCanvas).not.toHaveBeenCalled();
    expect(mockGetLuminanceFromRegion).toHaveBeenCalledWith(
      imageData,
      10,
      20,
      30,
      40
    );
    expect(mockToLowHighRange).toHaveBeenCalledWith(10, 101, undefined);
    expect(viewport.setProperties).toHaveBeenCalledWith({
      voiRange: { lower: 96, upper: 106 },
    });
    expect(viewport.render).toHaveBeenCalled();
  });

  it('returns early when no backing image data is available', () => {
    const viewport = {
      setProperties: jest.fn(),
      render: jest.fn(),
    };

    mockGetEnabledElement.mockReturnValue({ viewport });
    mockExtractWindowLevelRegionToolData.mockReturnValue(undefined);

    const tool = new WindowLevelRegionTool();
    tool.applyWindowLevelRegion(
      {
        data: {
          handles: {
            points: [
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
              [1, 1, 0],
            ],
          },
        },
      },
      {}
    );

    expect(mockGetLuminanceFromRegion).not.toHaveBeenCalled();
    expect(viewport.setProperties).not.toHaveBeenCalled();
    expect(viewport.render).not.toHaveBeenCalled();
  });
});
