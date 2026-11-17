import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';
import MeasurementReport from '../src/adapters/Cornerstone3D/MeasurementReport';
import { setWorldToImageCoords } from '../src/adapters/helpers';

const { worldToImageCoords: globalWorldToImageCoords } = utilities;

const { Length } = Cornerstone3DSR;

function worldToImageCoords(referencedImageId, point3) {
  if (point3[2] !== parseInt(referencedImageId)) {
    throw new Error(
      `Trying to convert a point with the wrong index: ${point3[2]}!==${referencedImageId}`
    );
  }
  return [point3[0], point3[1]];
}

const tool2d = {
  metadata: {
    referencedImageId: '2',
  },

  data: {
    handles: {
      points: [
        [0, 1, 2],
        [10, 5, 2],
      ],
    },
  },
};

const tool3d = {
  metadata: {
    FrameOfReferenceUID: '1.2.3',
  },

  data: {
    handles: {
      points: [
        [0, 1, 2],
        [10, 5, 11],
      ],
    },
  },
};

describe('Length', () => {
  beforeEach(() => {
    setWorldToImageCoords(worldToImageCoords);
    // Setup adapters
  });

  afterEach(() => {
    setWorldToImageCoords(globalWorldToImageCoords);
  });

  it('Must define tool type', () => {
    expect(Length.toolType).toBe('Length');
  });

  it('Must use scoord for planar', () => {
    const tidArgs = Length.getTID300RepresentationArguments(tool2d, false);
    // Either x,y or [x,y] is allowed
    expect(tidArgs.point1).toEqual({ x: 0, y: 1 });
    expect(tidArgs.point2).toEqual({ x: 10, y: 5 });
  });

  it('Must use scoord3d for mpr points', () => {
    const tidArgs = Length.getTID300RepresentationArguments(tool3d, true);
    expect(tidArgs.point1).toEqual({ x: 0, y: 1, z: 2 });
    expect(tidArgs.point2).toEqual({ x: 10, y: 5, z: 11 });
  });

  it('Must convert tid1501 to tool data scoord', () => {});
});

describe('Length measurement unit', () => {
  const imageKey = `imageId:${tool2d.metadata.referencedImageId}`;

  function toolWithUnit(unit) {
    return {
      ...tool2d,
      data: {
        ...tool2d.data,
        cachedStats: { [imageKey]: { length: 10.04, unit } },
      },
    };
  }

  // Writes the tool through the adapter and dcmjs, then reads the NUM content
  // item back through getMeasurementData.
  function roundTrip(unit) {
    const tidArgs = Length.getTID300RepresentationArguments(
      toolWithUnit(unit),
      false
    );
    const NUMGroup = new Length.TID300Representation(tidArgs)
      .contentItem()
      .find((item) => item.ValueType === 'NUM');

    const spy = jest
      .spyOn(MeasurementReport, 'getSetupMeasurementData')
      .mockReturnValue({
        state: { annotation: { data: { handles: {} } } },
        NUMGroup,
        worldCoords: tool2d.data.handles.points,
        referencedImageId: tool2d.metadata.referencedImageId,
        ReferencedFrameNumber: undefined,
      });
    try {
      const state = Length.getMeasurementData({}, {}, {});
      return state.annotation.data.cachedStats[imageKey];
    } finally {
      spy.mockRestore();
    }
  }

  beforeEach(() => {
    setWorldToImageCoords(worldToImageCoords);
  });

  afterEach(() => {
    setWorldToImageCoords(globalWorldToImageCoords);
  });

  it('Must pass a calibrated cm unit to TID300', () => {
    const tidArgs = Length.getTID300RepresentationArguments(
      toolWithUnit('cm US Region'),
      false
    );
    expect(tidArgs.distance).toBe(10.04);
    expect(tidArgs.unit).toBe('cm US Region');
  });

  it('Must pass a px unit to TID300', () => {
    const tidArgs = Length.getTID300RepresentationArguments(
      toolWithUnit('px'),
      false
    );
    expect(tidArgs.unit).toBe('px');
  });

  it('Must restore px from the SR', () => {
    expect(roundTrip('px')).toEqual({ length: 10.04, unit: 'px' });
  });

  it('Must restore mm from the SR', () => {
    expect(roundTrip('mm')).toEqual({ length: 10.04, unit: 'mm' });
  });
});

//
