import { afterEach, describe, it, expect, jest } from '@jest/globals';
import { log, utilities } from 'dcmjs';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';
import {
  DISPLAY_HOUNSFIELD_UNIT,
  DISPLAY_SQUARE_MILLIMETER,
  DISPLAY_SUV,
  UCUM_SUV_BODY_WEIGHT,
  mapUnitFromUCUM,
  mapUnitToUCUM,
} from '../src/adapters/Cornerstone3D/unitMapper';

const { RectangleROI, CircleROI, EllipticalROI, PlanarFreehandROI } =
  Cornerstone3DSR;
const { unit2CodingValue } = utilities.TID300;

const volumeId = 'cornerstoneStreamingImageVolume:ptVolume';
const arbitraryBqmlUnit = "[arb'U]{BQML}";

function createRoiTool(modalityUnit) {
  const points = [
    [0, 0, 0],
    [10, 0, 0],
    [0, 10, 0],
    [10, 10, 0],
  ];

  return {
    finding: undefined,
    findingSites: [],
    metadata: { volumeId, FrameOfReferenceUID: '1.2.3' },
    data: {
      handles: { points },
      // Only the Freehand ROI adapter reads the contour
      contour: { polyline: points, closed: true },
      cachedStats: {
        [`volumeId:${volumeId}`]: {
          area: 100,
          areaUnit: DISPLAY_SQUARE_MILLIMETER,
          max: 5,
          mean: 2,
          stdDev: 1,
          modalityUnit,
        },
      },
    },
  };
}

describe('unitMapper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps the SUV display unit to the body weight SUV UCUM code', () => {
    expect(mapUnitToUCUM(DISPLAY_SUV)).toBe(UCUM_SUV_BODY_WEIGHT);
  });

  it('keeps non SUV units unchanged on export', () => {
    expect(mapUnitToUCUM(DISPLAY_HOUNSFIELD_UNIT)).toBe(
      DISPLAY_HOUNSFIELD_UNIT
    );
    expect(mapUnitToUCUM(DISPLAY_SQUARE_MILLIMETER)).toBe(
      DISPLAY_SQUARE_MILLIMETER
    );
    expect(mapUnitToUCUM('raw')).toBe('raw');
    expect(mapUnitToUCUM('')).toBe('');
    expect(mapUnitToUCUM(undefined)).toBeUndefined();
  });

  it('maps the body weight SUV UCUM code back to SUV on import', () => {
    expect(mapUnitFromUCUM(UCUM_SUV_BODY_WEIGHT)).toBe(DISPLAY_SUV);
  });

  it('unwraps a dcmjs arbitrary unit on import', () => {
    expect(mapUnitFromUCUM(arbitraryBqmlUnit)).toBe('BQML');
  });

  it('gives the same arbitrary unit code after a load and save cycle', () => {
    // The dcmjs library logs an error each time it writes an arbitrary unit
    const logErrorSpy = jest.spyOn(log, 'error').mockImplementation(() => {});

    const savedAgain = unit2CodingValue(
      mapUnitToUCUM(mapUnitFromUCUM(arbitraryBqmlUnit))
    );

    expect(savedAgain.CodeValue).toBe(arbitraryBqmlUnit);
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
    expect(logErrorSpy).toHaveBeenCalledWith('Unspecified units', 'BQML');
  });
});

describe.each([
  ['RectangleROI', RectangleROI],
  ['CircleROI', CircleROI],
  ['EllipticalROI', EllipticalROI],
  ['PlanarFreehandROI', PlanarFreehandROI],
])('%s export units', (_name, adapter) => {
  it('passes the UCUM SUV code instead of the literal SUV unit', () => {
    const args = adapter.getTID300RepresentationArguments(
      createRoiTool(DISPLAY_SUV),
      true
    );

    expect(args.modalityUnit).toBe(UCUM_SUV_BODY_WEIGHT);
    expect(args.areaUnit).toBe(DISPLAY_SQUARE_MILLIMETER);
    expect(args.mean).toBe(2);
  });

  it('keeps the existing unit for non SUV statistics', () => {
    const args = adapter.getTID300RepresentationArguments(
      createRoiTool(DISPLAY_HOUNSFIELD_UNIT),
      true
    );

    expect(args.modalityUnit).toBe(DISPLAY_HOUNSFIELD_UNIT);
  });
});
