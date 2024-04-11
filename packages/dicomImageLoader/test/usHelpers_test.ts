import { expect, describe, it } from 'chai';
import { getUSEnhancedRegions } from '../src/imageLoader/wadors/metaData/USHelpers.js';

describe('getUSEnhancedRegions', () => {
  it('returns null when no ultrasound regions are found', () => {
    const metadata = {};
    const result = getUSEnhancedRegions(metadata);
    expect(result).toBeNull();
  });

  it('returns null when ultrasound regions are empty', () => {
    const metadata = { '00186011': [] };
    const result = getUSEnhancedRegions(metadata);
    expect(result).toBeNull();
  });

  it('returns the correct regions when ultrasound regions are present', () => {
    const metadata = {
      '00186011': [
        {
          '0018602C': [1],
          '0018602E': [2],
          '00186024': [3],
          '00186026': [4],
          '0018601A': [5],
          '0018601E': [6],
          '00186018': [7],
          '0018601C': [8],
          '00186020': [9],
          '00186022': [10],
          '0018602A': [11],
          '00186028': [12],
          '00186012': [13],
          '00186014': [14],
          '00186016': [15],
          '00186030': [16],
        },
      ],
    };
    const result = getUSEnhancedRegions(metadata);
    expect(result).toEqual([
      {
        regionLocationMinY0: 5,
        regionLocationMaxY1: 6,
        regionLocationMinX0: 7,
        regionLocationMaxX1: 8,
        referencePixelX0: 9,
        referencePixelY0: 10,
        physicalDeltaX: 1,
        physicalDeltaY: 2,
        physicalUnitsXDirection: 3,
        physicalUnitsYDirection: 4,
        referencePhysicalPixelValueY: 11,
        referencePhysicalPixelValueX: 12,
        regionSpatialFormat: 13,
        regionDataType: 14,
        regionFlags: 15,
        transducerFrequency: 16,
        pixelSpacing: [10, 20],
      },
    ]);
  });
});
