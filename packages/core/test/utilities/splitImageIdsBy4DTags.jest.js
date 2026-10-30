import dcmjs from '@dcmjs-org/dcmjs';
import splitImageIdsBy4DTags, {
  handleMultiframe4D,
  generateFrameImageId,
} from '../../src/utilities/splitImageIdsBy4DTags';
import { metaData } from '@cornerstonejs/metadata';
import { logging } from '@cornerstonejs/utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

describe('splitImageIdsBy4DTags - Multiframe 4D Functions', () => {
  let mockMetaDataGet;

  beforeEach(() => {
    mockMetaDataGet = jest
      .spyOn(metaData, 'get')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateFrameImageId', () => {
    it('should replace frame number in imageId with valid /frames/ pattern', () => {
      const baseImageId = 'wadors:/path/to/image.dcm/frames/1';
      const frameNumber = 5;
      const result = generateFrameImageId(baseImageId, frameNumber);
      expect(result).toBe('wadors:/path/to/image.dcm/frames/5');
    });

    it('should replace the frame number for query-param-based imageIds', () => {
      const baseImageId = 'wadouri:/path/to/image.dcm?frame=1';
      const frameNumber = 5;
      const result = generateFrameImageId(baseImageId, frameNumber);

      expect(result).toBe('wadouri:/path/to/image.dcm?frame=5');
    });

    it('should append a frame parameter for local file imageIds', () => {
      const baseImageId = 'dicomfile:0';
      const frameNumber = 5;
      const result = generateFrameImageId(baseImageId, frameNumber);

      expect(result).toBe('dicomfile:0?frame=5');
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

    it('should successfully split local multiframe imageIds without a /frames/ suffix', () => {
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
      });

      const result = handleMultiframe4D(['dicomfile:0']);

      expect(result).not.toBeNull();
      expect(result.splittingTag).toBe('TimeSlotVector');
      expect(result.imageIdGroups).toEqual([
        ['dicomfile:0?frame=1', 'dicomfile:0?frame=2'],
        ['dicomfile:0?frame=3', 'dicomfile:0?frame=4'],
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
      const loggerWarnSpy = jest
        .spyOn(
          logging.metadataLog.getLogger('utilities.splitImageIdsBy4DTags'),
          'warn'
        )
        .mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2],
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'TimeSlotVector length does not match NumberOfFrames:',
        3,
        'vs',
        4
      );

      loggerWarnSpy.mockRestore();
    });

    it('should return null when SliceVector length does not match NumberOfFrames', () => {
      const loggerWarnSpy = jest
        .spyOn(
          logging.metadataLog.getLogger('utilities.splitImageIdsBy4DTags'),
          'warn'
        )
        .mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
        SliceVector: [1, 2, 3],
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'SliceVector exists but has invalid length or undefined entries. Expected length:',
        4,
        'Actual length:',
        3
      );

      loggerWarnSpy.mockRestore();
    });

    it('should return null when SliceVector has undefined entries', () => {
      const loggerWarnSpy = jest
        .spyOn(
          logging.metadataLog.getLogger('utilities.splitImageIdsBy4DTags'),
          'warn'
        )
        .mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
        SliceVector: [1, 2, undefined, 4],
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'SliceVector exists but has invalid length or undefined entries. Expected length:',
        4,
        'Actual length:',
        4
      );

      loggerWarnSpy.mockRestore();
    });

    it('should return null when SliceVector is not an array', () => {
      const loggerWarnSpy = jest
        .spyOn(
          logging.metadataLog.getLogger('utilities.splitImageIdsBy4DTags'),
          'warn'
        )
        .mockImplementation();
      mockMetaDataGet.mockReturnValue({
        NumberOfFrames: 4,
        TimeSlotVector: [1, 1, 2, 2],
        SliceVector: 'not-an-array',
      });
      const result = handleMultiframe4D([baseImageId]);

      expect(result).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'SliceVector exists but is not an array. Expected length:',
        4
      );

      loggerWarnSpy.mockRestore();
    });
  });

  describe('GE diffusion b-value', () => {
    it('splits by the b-value of the GEMS_PARM_01 block of a copied dcmjs 1.0 instance', () => {
      const instances = {};
      const positions = {};
      for (const z of [0, 4]) {
        for (const bValue of ['0', '1000']) {
          const imageId = `wadors:/ge/${z}/${bValue}`;
          const naturalized = dcmjs.data.DicomMetaDictionary.naturalizeDataset({
            '00430010': { vr: 'LO', Value: ['GEMS_PARM_01'] },
            '00431039': { vr: 'IS', Value: [bValue, '8', '0', '0'] },
          });
          // A copy, as a multi-frame or a JSON path makes: no hex alias.
          instances[imageId] = { ...naturalized };
          positions[imageId] = [0, 0, z];
        }
      }
      mockMetaDataGet.mockImplementation((type, imageId) => {
        if (type === 'instance') {
          return instances[imageId];
        }
        if (type === 'imagePlaneModule') {
          return { imagePositionPatient: positions[imageId] };
        }
      });

      const result = splitImageIdsBy4DTags(Object.keys(instances));

      expect(result.splittingTag).toBe('GEPrivateBValue');
      expect(result.imageIdGroups).toEqual([
        ['wadors:/ge/0/0', 'wadors:/ge/4/0'],
        ['wadors:/ge/0/1000', 'wadors:/ge/4/1000'],
      ]);
    });
  });
});
