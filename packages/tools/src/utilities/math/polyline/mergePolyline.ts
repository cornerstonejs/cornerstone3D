import { Types } from '@cornerstonejs/core';
import { getFirstIntersectionWithPolyline } from './getIntersectionWithPolyline';
import { intersectLine } from '../line';

function mergePolyline(
  sourcePolyline: Types.Point2[],
  targetPolyline: Types.Point2[]
): boolean {
  const startTime = performance.now();
  for (let i = 0, sourceLen = sourcePolyline.length; i < sourceLen; i++) {
    const sourceP1 = sourcePolyline[i];
    const sourceP2Index = i === sourceLen - 1 ? 0 : i + 1;
    const sourceP2 = sourcePolyline[sourceP2Index];
    // const intersectionPointIndices = getFirstIntersectionWithPolyline(
    //   targetPolyline,
    //   sourceP1,
    //   sourceP2
    // );
    //
    // if (intersectionPointIndices?.length === 2) {
    //   // DEBUG - START /////////////////////////////////////////////////////////
    //   const [targetP1Index, targetP2Index] = intersectionPointIndices;
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
    //     '>>>>> time :: mergePolyline (true):',
    //     performance.now() - startTime
    //   );
    //   console.debug('>>>> intersectionPoint :: ', intersectionPoint);
    //
    //   return true;
    // }
  }

  console.log(
    '>>>>> time :: mergePolyline (false):',
    performance.now() - startTime
  );

  return false;
}

export { mergePolyline as default };
