import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { utilities as dcmjsUtilities } from 'dcmjs';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';
import { setWorldToImageCoords } from '../src/adapters/helpers';

const { worldToImageCoords: globalWorldToImageCoords } = utilities;
const { unit2CodingValue } = dcmjsUtilities.TID300;

const { CircleROI, PlanarFreehandROI } = Cornerstone3DSR;

const referencedImageId = '2';
const imageKey = `imageId:${referencedImageId}`;

// Writes the tool through the adapter and dcmjs and returns the units code
// of the NUM content item with the given concept name.
function writtenUnit(Adapter, tool, conceptName) {
  const tidArgs = Adapter.getTID300RepresentationArguments(tool, false);
  const item = new Adapter.TID300Representation(tidArgs)
    .contentItem()
    .find(
      (contentItem) =>
        contentItem.ValueType === 'NUM' &&
        [].concat(contentItem.ConceptNameCodeSequence)[0].CodeMeaning ===
          conceptName
    );
  return codeOf(item.MeasuredValueSequence.MeasurementUnitsCodeSequence);
}

function codeOf(unitsCode) {
  const { CodeValue, CodeMeaning } = [].concat(unitsCode)[0];
  return { CodeValue, CodeMeaning };
}

// Units a tool reports on an image without pixel spacing, and on an
// ultrasound region calibrated in cm, where the length and area units are
// written with different codes
const UNITS = [
  ['px', 'px²'],
  ['cm US Region', 'cm² US Region'],
];

describe('perimeter unit of ROI measurements in the SR', () => {
  beforeEach(() => {
    setWorldToImageCoords((_imageId, [x, y]) => [x, y]);
  });

  afterEach(() => {
    setWorldToImageCoords(globalWorldToImageCoords);
  });

  it.each(UNITS)(
    'CircleROI writes the perimeter in the unit of the radius (%s)',
    (unit, areaUnit) => {
      const tool = {
        metadata: { referencedImageId },
        data: {
          handles: {
            points: [
              [5, 5, 2],
              [10, 5, 2],
            ],
          },
          cachedStats: {
            [imageKey]: { area: 78.54, areaUnit, radius: 5, radiusUnit: unit },
          },
        },
      };

      expect(writtenUnit(CircleROI, tool, 'Perimeter')).toEqual(
        codeOf(unit2CodingValue(unit))
      );
    }
  );

  function freehandTool(closed, stats) {
    return {
      metadata: { referencedImageId },
      data: {
        contour: {
          polyline: [
            [0, 0, 2],
            [10, 0, 2],
            [10, 10, 2],
            [0, 10, 2],
          ],
          closed,
        },
        handles: { points: [] },
        cachedStats: { [imageKey]: stats },
      },
    };
  }

  it.each(UNITS)(
    'PlanarFreehandROI writes the perimeter of a closed contour in its unit (%s)',
    (unit, areaUnit) => {
      const tool = freehandTool(true, {
        area: 100,
        areaUnit,
        perimeter: 40,
        unit,
      });

      expect(writtenUnit(PlanarFreehandROI, tool, 'Perimeter')).toEqual(
        codeOf(unit2CodingValue(unit))
      );
    }
  );

  it('PlanarFreehandROI writes the length of an open contour in its unit', () => {
    const tool = freehandTool(false, { length: 30, unit: 'px' });

    expect(writtenUnit(PlanarFreehandROI, tool, 'Perimeter')).toEqual(
      codeOf(unit2CodingValue('px'))
    );
  });
});
