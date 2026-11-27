import { describe, it, expect, beforeEach } from '@jest/globals';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';

const { Probe } = Cornerstone3DSR;

describe('Probe', () => {
  beforeEach(() => {
    // Setup adapters
  });

  it('Must define tool type', () => {
    expect(Probe.toolType).toBe('Probe');
  });

  // A viewer shows "NaN" for a null value, so a probe with no value gets no stats
  it('restores a SCOORD3D probe with no NUM item without stats', () => {
    const { annotation } = Probe.getMeasurementData(
      {
        ContentSequence: [
          {
            ValueType: 'SCOORD3D',
            GraphicType: 'POINT',
            GraphicData: [1, 2, 3],
            ReferencedFrameOfReferenceUID: '1.2.840.99',
          },
        ],
      },
      {},
      {}
    );
    expect(annotation.data.cachedStats).toEqual({});
  });
});

//
