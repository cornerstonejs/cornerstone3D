import selectHandles, {
  createDotValues,
} from '../../../../src/utilities/contours/interpolation/selectHandles';
import { PointsArray } from '../../../../src/utilities/contours/PointsArray';

import { describe, it, expect } from '@jest/globals';

function createCircle(radius = 30) {
  const center = radius + 5;
  const points = PointsArray.create3(radius * 5);

  for (let angle = 0; angle < 360; angle++) {
    const radians = (angle * Math.PI) / 180;
    const dx = Math.cos(radians) * radius;
    const dy = Math.sin(radians) * radius;
    points.push([center + dx, center + dy, 0]);
  }
  return points;
}

function createSquare(edge: number) {
  const array = PointsArray.create3(410);
  for (let i = 0; i <= edge; i++) {
    array.push([i, 0, 0]);
  }
  for (let i = 1; i <= edge; i++) {
    array.push([edge, i, 0]);
  }
  for (let i = 1; i <= edge; i++) {
    array.push([edge - i, edge, 0]);
  }
  // This one is < edge to avoid the final point
  for (let i = 1; i < edge; i++) {
    array.push([0, edge - i, 0]);
  }
  return array;
}

describe('SelectHandles:', function () {
  it('Should select 3 handles for too small array', () => {
    const array = PointsArray.create3(5);
    array.push([0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]);
    const handles = selectHandles(array, 3);
    expect(handles.length).toBe(3);
  });

  it('Should select corner handles for square', () => {
    const array = createSquare(9);
    const handles = selectHandles(array, 3);
    expect(handles.getPointArray(0)).toEqual([0, 0, 0]);
    expect(handles.getPointArray(1)).toEqual([9, 0, 0]);
    expect(handles.getPointArray(2)).toEqual([9, 9, 0]);
    expect(handles.getPointArray(3)).toEqual([0, 9, 0]);
  });

  it('Should select corner and center handles for big square', () => {
    const array = createSquare(99);
    const handles = selectHandles(array, 3);
    expect(handles.getPointArray(1)).toEqual([0, 0, 0]);
    expect(handles.getPointArray(3)).toEqual([99, 0, 0]);
    expect(handles.getPointArray(5)).toEqual([99, 99, 0]);
    expect(handles.getPointArray(7)).toEqual([0, 99, 0]);

    expect(handles.getPointArray(0)).toEqual([0, 49, 0]);
    expect(handles.getPointArray(2)).toEqual([50, 0, 0]);
    expect(handles.getPointArray(4)).toEqual([99, 50, 0]);
    expect(handles.getPointArray(6)).toEqual([49, 99, 0]);
  });

  describe('SelectHandles.Internals', () => {
    it('Assigns uniform dot value', () => {
      const array = createCircle(30);
      const dotValues = createDotValues(array);
      for (let i = 0; i < array.length; i++) {
        expect(dotValues[i]).toBeCloseTo(0.9945217967033386);
      }
    });
  });
});
