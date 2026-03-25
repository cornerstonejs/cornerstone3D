import { vec3 } from 'gl-matrix';
import type {
  CPUFallbackEnabledElement,
  CPUIImageData,
  Point2,
  Point3,
} from '../../../types';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import pixelToCanvas from '../../helpers/cpuFallback/rendering/pixelToCanvas';

export function canvasToWorldPlanarCpuImage(
  enabledElement: CPUFallbackEnabledElement,
  imageData: CPUIImageData,
  canvasPos: Point2,
  worldPos: Point3 = [0, 0, 0]
): Point3 {
  const image = enabledElement.image;

  if (!image) {
    return worldPos;
  }

  const [px, py] = canvasToPixel(enabledElement, canvasPos);
  const { origin, spacing, direction } = imageData;
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;

  vec3.scaleAndAdd(worldPos, origin, iVector, px * spacing[0]);
  vec3.scaleAndAdd(worldPos, worldPos, jVector, py * spacing[1]);

  return worldPos;
}

export function worldToCanvasPlanarCpuImage(
  enabledElement: CPUFallbackEnabledElement,
  imageData: CPUIImageData,
  worldPos: Point3
): Point2 {
  const { origin, spacing, direction } = imageData;
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const diff = vec3.subtract(vec3.create(), worldPos, origin);
  const indexPoint: Point2 = [
    vec3.dot(diff, iVector) / spacing[0],
    vec3.dot(diff, jVector) / spacing[1],
  ];

  return pixelToCanvas(enabledElement, indexPoint);
}
