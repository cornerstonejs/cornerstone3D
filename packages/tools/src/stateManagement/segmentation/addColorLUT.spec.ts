import { addColorLUT } from './addColorLUT';
import { getColorLUT } from './getColorLUT';
import { removeColorLUT } from './removeColorLUT';

describe('addColorLUT', () => {
  it('pads the LUT through preview index 255', () => {
    const lutIndex = 987654;

    try {
      addColorLUT(
        [
          [0, 0, 0, 0],
          [221, 84, 84, 255],
        ],
        lutIndex
      );

      const colorLUT = getColorLUT(lutIndex);

      expect(colorLUT).toBeDefined();
      expect(colorLUT).toHaveLength(256);
      expect(colorLUT?.[255]).toBeDefined();
    } finally {
      removeColorLUT(lutIndex);
    }
  });
});
