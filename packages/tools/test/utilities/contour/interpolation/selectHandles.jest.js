import selectHandles from '../../../../src/utilities/contours/interpolation/selectHandles';
import { PointsArray } from '../../../../src/utilities/contours/PointsArray';

import { describe, it, expect } from '@jest/globals';

describe('SelectHandles:', function () {
  it('Should select 3 handles for too small array', () => {
    const array = PointsArray.create3(5);
    array.push([0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]);
    const handles = selectHandles(array, 3);
    expect(handles.length).toBe(3);
  });

  it('Should select corner handles for square', () => {
    const array = PointsArray.create3(41);
    for (let i = 0; i < 10; i++) {
      array.push([i, 0, 0]);
    }
    for (let i = 1; i < 10; i++) {
      array.push([9, i, 0]);
    }
    for (let i = 1; i < 10; i++) {
      array.push([9 - i, 9, 0]);
    }
    for (let i = 1; i < 10; i++) {
      array.push([0, 9 - i, 0]);
    }
    const handles = selectHandles(array, 3);
    expect(handles.getPointArray(0)).toEqual([0, 0, 0]);
    expect(handles.getPointArray(1)).toEqual([9, 0, 0]);
    expect(handles.getPointArray(2)).toEqual([9, 9, 0]);
    expect(handles.getPointArray(3)).toEqual([0, 9, 0]);
  });

  it('Should select corner and center handles for big square', () => {
    const array = PointsArray.create3(410);
    for (let i = 0; i < 100; i++) {
      array.push([i, 0, 0]);
    }
    for (let i = 1; i < 100; i++) {
      array.push([99, i, 0]);
    }
    for (let i = 1; i < 100; i++) {
      array.push([99 - i, 99, 0]);
    }
    for (let i = 1; i < 100; i++) {
      array.push([0, 99 - i, 0]);
    }
    const handles = selectHandles(array, 3);
    console.log(
      'handles',
      handles.getPoint(0),
      handles.getPoint(2),
      handles.getPoint(4),
      handles.getPoint(6)
    );
    expect(handles.getPointArray(1)).toEqual([0, 0, 0]);
    expect(handles.getPointArray(3)).toEqual([99, 0, 0]);
    expect(handles.getPointArray(5)).toEqual([99, 99, 0]);
    expect(handles.getPointArray(7)).toEqual([0, 99, 0]);

    expect(handles.getPointArray(0)).toEqual([0, 49, 0]);
    expect(handles.getPointArray(2)).toEqual([49, 0, 0]);
    expect(handles.getPointArray(4)).toEqual([99, 50, 0]);
    expect(handles.getPointArray(6)).toEqual([49, 99, 0]);
  });
});
