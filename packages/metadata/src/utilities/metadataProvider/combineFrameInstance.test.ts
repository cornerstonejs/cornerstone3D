import dcmjs from '@dcmjs-org/dcmjs';
import { combineFrameInstance } from './combineFrameInstance';

const { naturalizeDataset } = dcmjs.data.DicomMetaDictionary;

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

  // PS3.3 C.8.8.3.2: the offsets can be the absolute z values (axial only).
  it('gives the RTDOSE frame position from absolute GridFrameOffsetVector values', () => {
    const instance = {
      NumberOfFrames: 3,
      ImagePositionPatient: [0, 0, -100],
      ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
      GridFrameOffsetVector: [-100, -97.5, -95],
    };

    expect(combineFrameInstance(1, instance).ImagePositionPatient).toEqual([
      0, 0, -100,
    ]);
    expect(combineFrameInstance(2, instance).ImagePositionPatient).toEqual([
      0, 0, -97.5,
    ]);
  });

  // The user experience must have this: the frames of a US or XA cine with no
  // position stay distinct (OHIF/Viewers#5811, RTSTRUCT contours per frame).
  it('gives [0, 0, frameNumber] to a plain multi-frame frame with no position', () => {
    const instance = naturalizeDataset({
      '00280008': { vr: 'IS', Value: [3] },
      '00080060': { vr: 'CS', Value: ['US'] },
    });

    expect(combineFrameInstance(2, instance).ImagePositionPatient).toEqual([
      0, 0, 2,
    ]);
  });
});

// The API must do this: a private sequence directly in a functional group item
// is merged, and the private tag aliases of the root stay on the view.
describe('combineFrameInstance private macros', () => {
  const frameGroup = (value) => ({
    vr: 'SQ',
    Value: [
      {
        '20050010': { vr: 'LO', Value: ['Philips MR Imaging DD 005'] },
        '2005100D': { vr: 'DS', Value: [value] },
      },
    ],
  });

  it('keeps the private tag aliases of the root and of the private frame macros', () => {
    const instance = naturalizeDataset({
      '00280008': { vr: 'IS', Value: [2] },
      '70530010': { vr: 'LO', Value: ['Philips PET Private Group'] },
      '70531009': { vr: 'DS', Value: [1.88] },
      '52009229': { vr: 'SQ', Value: [{}] },
      '52009230': {
        vr: 'SQ',
        Value: [{ '00211001': frameGroup(1) }, { '00211001': frameGroup(2) }],
      },
    });

    const frame1 = combineFrameInstance(1, instance);
    const frame2 = combineFrameInstance(2, instance);

    expect(frame1['70531009']).toEqual([1.88]);
    expect(frame2['70531009']).toEqual([1.88]);
    expect(frame1['2005100D']).toEqual([1]);
    expect(frame2['2005100D']).toEqual([2]);
  });
});
