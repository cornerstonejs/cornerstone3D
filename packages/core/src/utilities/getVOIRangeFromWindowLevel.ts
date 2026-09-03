import { VOILUTFunctionType } from '../enums';
import type { VOIRange } from '../types';
import { toLowHighRange } from './windowLevel';

export default function getVOIRangeFromWindowLevel(
  windowWidth: number | number[] | undefined,
  windowCenter: number | number[] | undefined,
  voiLUTFunction: VOILUTFunctionType = VOILUTFunctionType.LINEAR
): VOIRange | undefined {
  let center: number | undefined;
  let width: number | undefined;

  if (typeof windowCenter === 'number' && typeof windowWidth === 'number') {
    center = windowCenter;
    width = windowWidth;
  } else if (Array.isArray(windowCenter) && Array.isArray(windowWidth)) {
    center = windowCenter[0];
    width = windowWidth[0];
  }

  if (center === undefined || width === undefined) {
    return;
  }

  return toLowHighRange(width, center, voiLUTFunction);
}
