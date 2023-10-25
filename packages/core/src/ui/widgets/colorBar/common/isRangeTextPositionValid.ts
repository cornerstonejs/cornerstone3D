import { ColorBarRangeTextPosition } from '../enums';

function isRangeTextPositionValid(
  colorbarWidth: number,
  colorbarHeight: number,
  rangeTextPosition: ColorBarRangeTextPosition
) {
  const isHorizontal = colorbarWidth >= colorbarHeight;
  const validRangeTextPositions = isHorizontal
    ? [ColorBarRangeTextPosition.Top, ColorBarRangeTextPosition.Bottom]
    : [ColorBarRangeTextPosition.Left, ColorBarRangeTextPosition.Right];

  return validRangeTextPositions.includes(rangeTextPosition);
}

export { isRangeTextPositionValid as default, isRangeTextPositionValid };
