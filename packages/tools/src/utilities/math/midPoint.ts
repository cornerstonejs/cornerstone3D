import { Types } from '@cornerstonejs/core';

/**
 * Return the midpoint (think average) of all the provided points.
 */
const midPoint = (
  ...args: (Types.Point2 | Types.Point3)[]
): Types.Point2 | Types.Point3 => {
  const ret =
    args[0].length === 2 ? <Types.Point2>[0, 0] : <Types.Point3>[0, 0, 0];
  const len = args.length;
  for (const arg of args) {
    ret[0] += arg[0] / len;
    ret[1] += arg[1] / len;
    if (ret.length === 3) ret[2] += arg[2] / len;
  }
  return ret;
};

const midPoint2 = midPoint as (...args: Types.Point2[]) => Types.Point2;

export default midPoint;

export { midPoint2 };
