import { isSameScaleRatio } from '../src/utilities/math/isSameScaleRatio';

describe('isSameScaleRatio', () => {
  // [decoded frame, target buffer, expected]
  const cases = [
    ['257x1025', '513x2049', true],
    ['65x128', '513x1024', true],
    ['256x200', '512x512', false],
    ['512x512', '512x511', false],
    ['512x512', '512x513', false],
    ['512x512', '511x512', false],
    ['512x512', '513x511', false],
    ['512x512', '256x256', true],
    ['512x512', '1024x1024', true],
    ['512x512', '512x512', true],
  ];

  const toSize = (size) => {
    const [rows, columns] = size.split('x').map(Number);
    return { rows, columns };
  };

  it.each(cases)('%s to %s gives %s', (frame, target, expected) => {
    const { rows, columns } = toSize(target);
    expect(isSameScaleRatio(toSize(frame), rows, columns)).toBe(expected);
  });
});
