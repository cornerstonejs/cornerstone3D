import { Types } from '@cornerstonejs/core';
import { getFirstIntersectionWithPolyline } from './getIntersectionWithPolyline';
import { intersectLine } from '../line';

function intersectPolyline(
  sourcePolyline: Types.Point2[],
  targetPolyline: Types.Point2[]
): boolean {
  // Naive way to detect intersection between polylines.
  // TODO: implement using R-Trees to make it run faster
  const startTime = performance.now();
  for (let i = 0, sourceLen = sourcePolyline.length; i < sourceLen; i++) {
    const sourceP1 = sourcePolyline[i];
    const sourceP2Index = i === sourceLen - 1 ? 0 : i + 1;
    const sourceP2 = sourcePolyline[sourceP2Index];

    const intersectionPointIndexes = getFirstIntersectionWithPolyline(
      targetPolyline,
      sourceP1,
      sourceP2
    );
    const intersect = intersectionPointIndexes?.length === 2;

    // if (intersectionPointIndexes?.length === 2) {
    //   // DEBUG - START /////////////////////////////////////////////////////////
    //   const [targetP1Index, targetP2Index] = intersectionPointIndexes;
    //   const targetP1 = targetPolyline[targetP1Index];
    //   const targetP2 = targetPolyline[targetP2Index];
    //   const intersectionPoint = intersectLine(
    //     sourceP1,
    //     sourceP2,
    //     targetP1,
    //     targetP2
    //   );
    //   // DEBUG - END ///////////////////////////////////////////////////////////
    //
    //   console.log(
    //     '>>>>> time :: intersectPolyline (true):',
    //     performance.now() - startTime
    //   );
    //   console.debug('>>>> intersectionPoint :: ', intersectionPoint);
    //
    //   return true;
    // }

    if (intersect) {
      // prettier-ignore
      console.log(`>>>>> time :: intersectPolyline (true, ${sourcePolyline.length}, ${targetPolyline.length}):`, performance.now() - startTime);
    }

    return intersect;
  }

  // prettier-ignore
  console.log(`>>>>> time :: intersectPolyline (false, ${sourcePolyline.length}, ${targetPolyline.length}):`, performance.now() - startTime);

  return false;
}

export { intersectPolyline as default };
