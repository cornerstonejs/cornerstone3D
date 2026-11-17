import createLinearRGBTransferFunction from '../../src/utilities/createLinearRGBTransferFunction';
import { toLowHighRange } from '../../src/utilities/windowLevel';

function nodeXs(cfun) {
  const xs = [];
  for (let i = 0; i < cfun.getSize(); i++) {
    const node = [];
    cfun.getNodeValue(i, node);
    xs.push(node[0]);
  }
  return xs;
}

function grayAt(cfun, x) {
  const rgb = [];
  cfun.getColor(x, rgb);
  return rgb[0];
}

describe('createLinearRGBTransferFunction', () => {
  it('places a black node at lower and a white node at upper', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 10, upper: 50 });

    expect(nodeXs(cfun)).toEqual([10, 50]);
    expect(cfun.getRange()).toEqual([10, 50]);
    expect(grayAt(cfun, 10)).toBe(0);
    expect(grayAt(cfun, 30)).toBeCloseTo(0.5);
    expect(grayAt(cfun, 50)).toBe(1);
  });

  it('defaults to [0, 1024] when the range is not given', () => {
    const cfun = createLinearRGBTransferFunction({});

    expect(nodeXs(cfun)).toEqual([0, 1024]);
  });

  // A zero width window (for example WC 0.5 / WW 1, which the linear VOI
  // formula maps to lower === upper) used to leave a single node, so the
  // function range was zero wide and every later setRange computed
  // NaN/Infinity node positions: the LUT stayed a step function. See #2733.
  it.each([
    [0, 0],
    [100, 100],
    [-1024, -1024],
  ])(
    'keeps two distinct nodes for the degenerate range [%p, %p]',
    (lower, upper) => {
      const cfun = createLinearRGBTransferFunction({ lower, upper });
      const xs = nodeXs(cfun);

      expect(xs).toHaveLength(2);
      expect(xs[1]).toBeGreaterThan(xs[0]);
      // The threshold stays at the window: the nodes are only nudged apart.
      expect(xs[0]).toBeCloseTo(lower, 2);
      expect(xs[1]).toBeCloseTo(upper, 2);
      expect(grayAt(cfun, lower - 1)).toBe(0);
      expect(grayAt(cfun, lower + 1)).toBe(1);
    }
  );

  it('rescales to a later, valid range after a degenerate one', () => {
    // WC 0.5 / WW 1, as on the all-zero padding frame of the cine in #2733.
    const degenerate = toLowHighRange(1, 0.5);
    expect(degenerate).toEqual({ lower: 0, upper: 0 });
    const cfun = createLinearRGBTransferFunction(degenerate);

    cfun.setRange(0, 255);

    const xs = nodeXs(cfun);
    expect(xs.every(Number.isFinite)).toBe(true);
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[1]).toBeCloseTo(255, 6);
    expect(cfun.getRange()).toEqual([0, 255]);
    expect(grayAt(cfun, 0)).toBe(0);
    expect(grayAt(cfun, 127.5)).toBeCloseTo(0.5);
    expect(grayAt(cfun, 255)).toBe(1);
  });
});
