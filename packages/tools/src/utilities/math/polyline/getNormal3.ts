import { vec3 } from 'gl-matrix';
import { Types } from '@cornerstonejs/core';

/**
 * Calculate the normal of a planar polyline in 3D space
 * @param polyline - Planar polyline in 3D space
 * @returns Normal of the planar polyline in 3D space
 */
function getNormal3(polyline: Types.Point3[]): Types.Point3 {
  const startTime = performance.now();
  const vecCrossProd = vec3.create();
  const vecP1P2 = vec3.create();
  const vecP2P3 = vec3.create();
  const vecNormal = vec3.create();

  const meanPoint = polyline.reduce(
    (acc, cur) => vec3.add(acc, acc, cur),
    vec3.create()
  );

  vec3.scale(meanPoint, meanPoint, 1 / polyline.length);

  for (let i = 0, len = polyline.length; i < len; i++) {
    const p1 = polyline[i];
    // Using ternary instead of % (mod) operator to make it faster
    const p2Index = i === len - 1 ? 0 : i + 1;
    const p2 = polyline[p2Index];

    vec3.sub(vecP1P2, p1, meanPoint);
    vec3.sub(vecP2P3, p2, meanPoint);
    vec3.cross(vecCrossProd, vecP1P2, vecP2P3) as Types.Point3;
    vec3.add(vecNormal, vecNormal, vecCrossProd);
  }

  vec3.normalize(vecNormal, vecNormal);

  // prettier-ignore
  console.log('>>>>> time :: getNormal3:', performance.now() - startTime);
  return vecNormal as Types.Point3;
}

export { getNormal3 as default };
