import { combineFrameInstance } from './combineFrameInstance';

// The API must do this: the modality fallbacks that dcmjs frameDataset does not
// compute (NM detector position, RTDOSE GridFrameOffsetVector).
describe('combineFrameInstance fallbacks', () => {
  it('gives the NM frame position and orientation from the detector', () => {
    const instance = {
      NumberOfFrames: 3,
      ImageType: ['ORIGINAL\\PRIMARY'],
      SpacingBetweenSlices: 2,
      DetectorInformationSequence: [
        {
          ImagePositionPatient: [1, 2, 3],
          ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
        },
      ],
    };
    const frame = combineFrameInstance(3, instance);

    expect(frame.ImagePositionPatient).toEqual([1, 2, 7]);
    expect(frame.ImageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    expect(frame.ImageType).toEqual(['ORIGINAL', 'PRIMARY']);
    expect(frame.frameNumber).toBe(3);
    expect(combineFrameInstance(3, instance)).toBe(frame);
    expect(Object.keys(instance)).not.toContain('ImagePositionPatient');
  });

  it('gives the RTDOSE frame position from GridFrameOffsetVector', () => {
    const instance = {
      NumberOfFrames: 3,
      ImagePositionPatient: [10, 20, 30],
      ImageOrientationPatient: [0, 1, 0, 0, 0, -1],
      GridFrameOffsetVector: [0, 5, 10],
    };

    expect(combineFrameInstance(3, instance).ImagePositionPatient).toEqual([
      0, 20, 30,
    ]);
  });
});
