import getLinesIntersections from '../../src/utilities/math/polyline/getLinesIntersection';
import { describe, it, expect } from '@jest/globals';

const p11 = [1, 1];
const p10 = [1, 0];
const p01 = [0, 1];
const p00 = [0, 0];
const p22 = [2, 2];

describe('getLinesIntersections', function () {
  it('Should find overlapping intersection', () => {
    const pTest = getLinesIntersections(p00, p11, p10, p01);
    expect(pTest[0]).toBeCloseTo(0.5);
    expect(pTest[1]).toBeCloseTo(0.5);
  });
  it('Should find co-incident overlapping intersections', () => {
    const pTest = getLinesIntersections(p00, p11, p11, p22);
    expect(pTest[0]).toBeCloseTo(1);
    expect(pTest[1]).toBeCloseTo(1);
  });

  it('Should find projected intersection of extended points', () => {
    const pTest = getLinesIntersections(p00, p11, [2, 0], [3, -1]);
    expect(pTest[0]).toBeCloseTo(1);
    expect(pTest[1]).toBeCloseTo(1);
  });

  it('Should return undefined for line segments that are parallel', () => {
    const pTest = getLinesIntersections(p00, p11, [0, -1], p10);
    expect(pTest).toBeUndefined();
  });

  it('Should return undefined for line segments that are close to parallel', () => {
    const pTest = getLinesIntersections(p00, p11, [0, -1], [1, 0.000000001]);
    expect(pTest).toBeUndefined();
  });

  it('Should find the midpoint for parallel and overlapping line segments', () => {
    // Some special cases found during developement that failed due to precision
    // prettier-ignore
    const testDataItems = [
      {
        line1: [ [195, 162], [35, 8] ],
        line2: [ [162.0054016113281, 130.2427062988281], [509.6806335449219, 464.88006591796875] ],
        expectedResult: [178.50270080566406, 146.12135314941406],
      },
      {
        line1: [ [32, 3], [173, 158] ],
        line2: [ [83.71684265136719, 59.85185623168945], [-234.60658264160156, -290.07818603515625] ],
        expectedResult: [57.858421325683594, 31.425928115844727],
      },
      {
        line1: [ [198, 191], [127, 71] ],
        line2: [ [173.1763458251953, 149.04454040527344], [298.0058898925781, 360.0240173339844] ],
        expectedResult: [185.58817291259766, 170.02227020263672],
      },
      {
        line1: [ [22, 79], [168, 188] ],
        line2: [ [100.70091247558594, 137.7561492919922], [153.59054565429688, 177.24224853515625] ],
        expectedResult: [127.1457290649414, 157.49919891357422],
      },
      {
        line1: [ [185, 165], [45, 196] ],
        line2: [ [174.66880798339844, 167.2876281738281], [276.9229431152344, 144.6456298828125] ],
        expectedResult: [179.83440399169922, 166.14381408691406],
      },
      {
        line1: [ [178, 60], [157, 5] ],
        line2: [ [174.63169860839844, 51.17824172973633], [171.54701232910156, 43.09931564331055] ],
        expectedResult: [173.08935546875, 47.13877868652344],
      },
      {
        line1: [ [66, 69], [86, 27] ],
        line2: [ [85.16705322265625, 28.74919319152832], [101.72046661376953, -6.012975215911865] ],
        expectedResult: [85.5835266113281, 27.87459659576416],
      },
    ];

    testDataItems.forEach((testDataItem) => {
      const { line1: l1, line2: l2, expectedResult } = testDataItem;
      const pTest = getLinesIntersections(l1[0], l1[1], l2[0], l2[1]);

      expect(pTest[0]).toBeCloseTo(expectedResult[0]);
      expect(pTest[1]).toBeCloseTo(expectedResult[1]);
    });
  });

  it('Should return undefined for parallel but non-overlapping line segments', () => {
    // prettier-ignore
    const testDataItems = [
      {
        line1: [ [29, 190], [179, 31] ],
        line2: [ [323.050537109375, -121.69355773925781], [374.97039794921875, -176.72860717773438] ],
      },
      {
        line1: [ [66, 167], [129, 114] ],
        line2: [ [173.96234130859375, 76.17453002929688], [195.35704040527344, 58.175811767578125] ],
      },
      {
        line1: [ [77, 151], [108, 116] ],
        line2: [ [118.97332763671875, 103.61076354980469], [134.26632690429688, 86.34447479248047] ],
      },
      {
        line1: [ [93, 48], [186, 132] ],
        line2: [ [211.2313232421875, 154.7895812988281], [260.7231750488281, 199.49191284179688] ],
      },
      {
        line1: [ [2, 91], [103, 129] ],
        line2: [ [137.0966339111328, 141.8284454345703], [149.7457580566406, 146.5875244140625] ],
      },
    ];

    testDataItems.forEach((testDataItem) => {
      const { line1: l1, line2: l2, expectedResult } = testDataItem;
      const pTest = getLinesIntersections(l1[0], l1[1], l2[0], l2[1]);

      expect(pTest).toBeUndefined();
    });
  });
});
