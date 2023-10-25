import { ColorbarRangeTextPosition } from '../enums';

function isRangeTextPositionValid(
  colorbarWidth: number,
  colorbarHeight: number,
  rangeTextPosition: ColorbarRangeTextPosition
) {
  const isHorizontal = colorbarWidth >= colorbarHeight;
  const validRangeTextPositions = isHorizontal
    ? [ColorbarRangeTextPosition.Top, ColorbarRangeTextPosition.Bottom]
    : [ColorbarRangeTextPosition.Left, ColorbarRangeTextPosition.Right];

  return validRangeTextPositions.includes(rangeTextPosition);
}

export { isRangeTextPositionValid as default, isRangeTextPositionValid };
