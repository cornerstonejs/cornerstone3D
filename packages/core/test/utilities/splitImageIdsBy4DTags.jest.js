import {
  handleMultiframe4D,
  generateFrameImageId,
} from '../../src/utilities/splitImageIdsBy4DTags';
import * as metaData from '../../src/metaData';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

describe('splitImageIdsBy4DTags - Multiframe 4D Functions', () => {
  let originalMetaDataGet;
  let mockMetaDataGet;

  beforeEach(() => {
    originalMetaDataGet = metaData.get;
    mockMetaDataGet = jest.fn();
    metaData.get = mockMetaDataGet;
  });

  afterEach(() => {
    metaData.get = originalMetaDataGet;
    jest.clearAllMocks();
  });

  describe('generateFrameImageId', () => {
    it('should replace frame number in imageId with valid /frames/ pattern', () => {
      const baseImageId = 'wadors:/path/to/image.dcm/frames/1';
      const frameNumber = 5;
      const result = generateFrameImageId(baseImageId, frameNumber);
      expect(result).toBe('wadors:/path/to/image.dcm/frames/5');
    });

    it('should throw an error when /frames/ pattern is missing', () => {
      const baseImageId = 'wadors:/path/to/image.dcm';
      const frameNumber = 5;

      expect(() => generateFrameImageId(baseImageId, frameNumber)).toThrow(
        'baseImageId must contain a "/frames/" pattern followed by a digit'
      );
    });
  });

  describe('handleMultiframe4D', () => {
    const baseImageId = 'wadors:/path/to/multiframe.dcm/frames/1';

    it('should successfully split frames by TimeSlotVector without SliceVector', () => {
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
      });

      const result = handleMultiframe4D([baseImageId]);

      expect(result).not.toBeNull();
      expect(result.splittingTag).toBe('TimeSlotVector');
      expect(result.imageIdGroups).toHaveLength(2);
      expect(result.imageIdGroups[0]).toEqual([
        'wadors:/path/to/multiframe.dcm/frames/1',
        'wadors:/path/to/multiframe.dcm/frames/2',
      ]);
      expect(result.imageIdGroups[1]).toEqual([
        'wadors:/path/to/multiframe.dcm/frames/3',
        'wadors:/path/to/multiframe.dcm/frames/4',
      ]);
    });

    it('should handle SliceVector correctly and sort slices within time slots', () => {
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 6,
        TimeSlotVector: [1, 1, 1, 2, 2, 2],
        SliceVector: [2, 1, 3, 2, 1, 3],
        NumberOfSlices: 3,
      });

      const result = handleMultiframe4D([baseImageId]);

      expect(result).not.toBeNull();
      expect(result.imageIdGroups).toHaveLength(2);
      expect(result.imageIdGroups[0]).toEqual([
        'wadors:/path/to/multiframe.dcm/frames/2',
        'wadors:/path/to/multiframe.dcm/frames/1',
        'wadors:/path/to/multiframe.dcm/frames/3',
      ]);
      expect(result.imageIdGroups[1]).toEqual([
        'wadors:/path/to/multiframe.dcm/frames/5',
        'wadors:/path/to/multiframe.dcm/frames/4',
        'wadors:/path/to/multiframe.dcm/frames/6',
      ]);
    });

    it('should return null when TimeSlotVector length does not match NumberOfFrames', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2],
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'TimeSlotVector length does not match NumberOfFrames:',
        3,
        'vs',
        4
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return null when SliceVector length does not match NumberOfFrames', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
        SliceVector: [1, 2, 3],
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'SliceVector exists but has invalid length or undefined entries. Expected length:',
        4,
        'Actual length:',
        3
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return null when SliceVector has undefined entries', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
        SliceVector: [1, 2, undefined, 4],
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'SliceVector exists but has invalid length or undefined entries. Expected length:',
        4,
        'Actual length:',
        4
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return null when SliceVector is not an array', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
        SliceVector: 'not-an-array',
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'SliceVector exists but has invalid length or undefined entries. Expected length:',
        4,
        'Actual length:',
        0
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
