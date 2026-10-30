import { describe, it, expect } from '@jest/globals';
import { data as dcmjsData } from '@dcmjs-org/dcmjs';
import { getSegmentIndex } from '../src/adapters/Cornerstone/Segmentation_4X';

const { DicomMetaDictionary } = dcmjsData;

/**
 * dcmjs 1.0 naturalizes a one-item sequence as the item object (not an array)
 * and keeps a VM 1-n value such as ReferencedSegmentNumber as a list. The SEG
 * readers must still give the segment number as a number.
 */
function perFrameItem(segmentNumber) {
  return {
    '0062000A': {
      vr: 'SQ',
      Value: [{ '0062000B': { vr: 'US', Value: [segmentNumber] } }],
    },
  };
}

function naturalizeSeg(perFrameItems) {
  return DicomMetaDictionary.naturalizeDataset({
    52009230: { vr: 'SQ', Value: perFrameItems },
  });
}

describe('SEG read through dcmjs naturalizeDataset', () => {
  it('gives the segment number of each frame as a number', () => {
    const multiframe = naturalizeSeg([perFrameItem(1), perFrameItem(2)]);

    expect(getSegmentIndex(multiframe, 0)).toBe(1);
    expect(getSegmentIndex(multiframe, 1)).toBe(2);
  });

  it('gives the segment number of a SEG with one frame', () => {
    const multiframe = naturalizeSeg([perFrameItem(3)]);

    expect(getSegmentIndex(multiframe, 0)).toBe(3);
  });
});
