import { getLuminanceFromRegion } from './getLuminanceFromRegion';

const luminance = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

// 3x2 image, one distinct color per pixel (row-major).
const COLUMNS = 3;
const ROWS = 2;
const PIXELS: [number, number, number][] = [
  [10, 20, 30],
  [40, 50, 60],
  [70, 80, 90],
  [100, 110, 120],
  [130, 140, 150],
  [160, 170, 180],
];

function interleave(components: number) {
  const data = new Uint8Array(PIXELS.length * components);
  PIXELS.forEach((rgb, i) => {
    data.set(rgb, i * components);
    if (components === 4) {
      data[i * 4 + 3] = 255;
    }
  });
  return data;
}

// Luminance of the 2x2 region starting at (x=1, y=0).
const EXPECTED_REGION = [PIXELS[1], PIXELS[2], PIXELS[4], PIXELS[5]].map(
  ([r, g, b]) => luminance(r, g, b)
);

describe('getLuminanceFromRegion', () => {
  it('reads RGB (3-component) color pixel data with a stride of 3', () => {
    const imageData = {
      scalarData: interleave(3),
      color: true,
      rows: ROWS,
      columns: COLUMNS,
    };

    const result = getLuminanceFromRegion(imageData, 1, 0, 2, 2);

    expect(result).toHaveLength(4);
    result.forEach((value, i) => {
      expect(value).toBeCloseTo(EXPECTED_REGION[i], 6);
    });
  });

  it('reads RGBA (4-component) color pixel data with a stride of 4', () => {
    const imageData = {
      scalarData: interleave(4),
      color: true,
      rows: ROWS,
      columns: COLUMNS,
    };

    const result = getLuminanceFromRegion(imageData, 1, 0, 2, 2);

    expect(result).toHaveLength(4);
    result.forEach((value, i) => {
      expect(value).toBeCloseTo(EXPECTED_REGION[i], 6);
    });
  });

  it('returns the raw values for grayscale pixel data', () => {
    const imageData = {
      scalarData: new Int16Array([-5, 0, 5, 10, 15, 20]),
      color: false,
      rows: ROWS,
      columns: COLUMNS,
    };

    expect(getLuminanceFromRegion(imageData, 1, 0, 2, 2)).toEqual([
      0, 5, 15, 20,
    ]);
  });
});
