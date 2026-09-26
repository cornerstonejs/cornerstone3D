import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { data as dcmjsData } from 'dcmjs';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';
import MeasurementReport from '../src/adapters/Cornerstone3D/MeasurementReport';
import { setWorldToImageCoords } from '../src/adapters/helpers';

const { worldToImageCoords: globalWorldToImageCoords } = utilities;
const { DicomMetaDictionary } = dcmjsData;

const { CircleROI, EllipticalROI, PlanarFreehandROI, RectangleROI } =
  Cornerstone3DSR;

const referencedImageId = '2';
const imageKey = `imageId:${referencedImageId}`;
const sopInstanceUid = '1.2.3.4';

/**
 * Writes the tool through the adapter and dcmjs, encodes the content items
 * to DICOM and back as a stored SR is read, then restores the annotation with
 * getMeasurementData and returns its cached stats. The encoding turns the
 * numeric values into strings, so only the units are compared.
 */
function roundTrip(Adapter, tool, editArgs = (tidArgs) => tidArgs) {
  const tidArgs = editArgs(
    Adapter.getTID300RepresentationArguments(tool, false)
  );
  const { ContentSequence } = DicomMetaDictionary.naturalizeDataset(
    DicomMetaDictionary.denaturalizeDataset({
      ContentSequence: new Adapter.TID300Representation(tidArgs).contentItem(),
    })
  );
  const items = [].concat(ContentSequence);

  const spy = jest
    .spyOn(MeasurementReport, 'getSetupMeasurementData')
    .mockReturnValue({
      state: { annotation: { data: { handles: {} } }, sopInstanceUid },
      NUMGroup: items.find((item) => item.ValueType === 'NUM'),
      worldCoords: worldCoordsOf(tool),
      referencedImageId,
      ReferencedFrameNumber: undefined,
    });
  try {
    const state = Adapter.getMeasurementData(
      { ContentSequence: items },
      {},
      {}
    );
    return state.annotation.data.cachedStats[imageKey];
  } finally {
    spy.mockRestore();
  }
}

// The points of the SCOORD: a closed contour repeats its first point at the end
function worldCoordsOf({ data }) {
  if (!data.contour) {
    return data.handles.points;
  }
  const { polyline, closed } = data.contour;
  return closed ? [...polyline, polyline[0]] : [...polyline];
}

function toolWith(data) {
  return { metadata: { referencedImageId }, data };
}

const circlePoints = [
  [5, 5, 2],
  [10, 5, 2],
];

// A CT image with pixel spacing, a PT image in SUV (a unit dcmjs does not
// know and writes as [arb'U]{SUV}), an image without pixel spacing, and an
// ultrasound region calibrated in cm (also written as arbitrary units)
const UNITS = [
  ['CT', { unit: 'mm', areaUnit: 'mm²', modalityUnit: 'HU' }],
  ['PT', { unit: 'mm', areaUnit: 'mm²', modalityUnit: 'SUV' }],
  ['no pixel spacing', { unit: 'px', areaUnit: 'px²', modalityUnit: 'HU' }],
  [
    'ultrasound region',
    { unit: 'cm US Region', areaUnit: 'cm² US Region', modalityUnit: 'HU' },
  ],
];

const intensityStats = { mean: 40, stdDev: 2, max: 50, min: 30 };

describe('units restored from an SR', () => {
  beforeEach(() => {
    setWorldToImageCoords((_imageId, [x, y]) => [x, y]);
  });

  afterEach(() => {
    setWorldToImageCoords(globalWorldToImageCoords);
  });

  it.each(UNITS)(
    'CircleROI on %s',
    (_name, { unit, areaUnit, modalityUnit }) => {
      const stats = roundTrip(
        CircleROI,
        toolWith({
          handles: { points: circlePoints },
          cachedStats: {
            [imageKey]: {
              area: 78.54,
              areaUnit,
              radius: 5,
              radiusUnit: unit,
              modalityUnit,
              ...intensityStats,
            },
          },
        })
      );

      expect(stats).toMatchObject({ areaUnit, radiusUnit: unit, modalityUnit });
    }
  );

  it.each(UNITS)('EllipticalROI on %s', (_name, { areaUnit, modalityUnit }) => {
    const stats = roundTrip(
      EllipticalROI,
      toolWith({
        handles: {
          points: [
            [5, 0, 2],
            [5, 10, 2],
            [0, 5, 2],
            [10, 5, 2],
          ],
        },
        cachedStats: {
          [imageKey]: {
            area: 78.54,
            areaUnit,
            modalityUnit,
            ...intensityStats,
          },
        },
      })
    );

    expect(stats).toMatchObject({ areaUnit, modalityUnit });
  });

  it.each(UNITS)('RectangleROI on %s', (_name, { areaUnit, modalityUnit }) => {
    const stats = roundTrip(
      RectangleROI,
      toolWith({
        handles: {
          points: [
            [0, 0, 2],
            [10, 0, 2],
            [0, 10, 2],
            [10, 10, 2],
          ],
        },
        cachedStats: {
          [imageKey]: { area: 100, areaUnit, modalityUnit, ...intensityStats },
        },
      })
    );

    expect(stats).toMatchObject({ areaUnit, modalityUnit });
  });

  const square = [
    [0, 0, 2],
    [10, 0, 2],
    [10, 10, 2],
    [0, 10, 2],
  ];

  it.each(UNITS)(
    'closed PlanarFreehandROI on %s',
    (_name, { unit, areaUnit, modalityUnit }) => {
      const stats = roundTrip(
        PlanarFreehandROI,
        toolWith({
          contour: { polyline: square, closed: true },
          handles: { points: [] },
          cachedStats: {
            [imageKey]: {
              area: 100,
              areaUnit,
              perimeter: 40,
              unit,
              modalityUnit,
              ...intensityStats,
            },
          },
        })
      );

      // The perimeter unit is written right only with #2944
      expect(stats).toMatchObject({ areaUnit, modalityUnit });
      expect(Number(stats.perimeter)).toBe(40);
      expect(stats.length).toBeUndefined();
    }
  );

  // SRs written before the radius was stored (January 2026) carry only the
  // area and the perimeter of a circle
  it('CircleROI without a stored radius takes it from the perimeter', () => {
    const stats = roundTrip(
      CircleROI,
      toolWith({
        handles: { points: circlePoints },
        cachedStats: {
          [imageKey]: {
            area: 78.54,
            areaUnit: 'mm²',
            radius: 5,
            radiusUnit: 'mm',
          },
        },
      }),
      ({ radius, radiusUnit, ...tidArgs }) => ({ ...tidArgs, unit: 'mm' })
    );

    expect(Number(stats.radius)).toBeCloseTo(5);
    expect(stats.radiusUnit).toBe('mm');
  });

  it('CircleROI with neither a radius nor a perimeter keeps a radius of 0', () => {
    const stats = roundTrip(
      CircleROI,
      toolWith({
        handles: { points: circlePoints },
        cachedStats: {
          [imageKey]: { area: 78.54, areaUnit: 'mm²', radius: 5 },
        },
      }),
      ({ radius, radiusUnit, perimeter, ...tidArgs }) => tidArgs
    );

    expect(stats.radius).toBe(0);
  });

  // dcmjs writes the length of an open contour as its perimeter
  it('open PlanarFreehandROI restores its length', () => {
    const stats = roundTrip(
      PlanarFreehandROI,
      toolWith({
        contour: { polyline: square.slice(0, 3), closed: false },
        handles: { points: [] },
        cachedStats: { [imageKey]: { length: 20, unit: 'mm' } },
      })
    );

    expect(Number(stats.length)).toBe(20);
    expect(stats.perimeter).toBeUndefined();
    expect(stats.unit).toBe('mm');
  });
});
