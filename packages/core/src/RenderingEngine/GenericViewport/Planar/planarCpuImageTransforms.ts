import { vec3 } from 'gl-matrix';
import type {
  CPUFallbackEnabledElement,
  CPUIImageData,
  Point2,
  Point3,
} from '../../../types';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import pixelToCanvas from '../../helpers/cpuFallback/rendering/pixelToCanvas';

function getDisplayedAreaSource(
  enabledElement: CPUFallbackEnabledElement
): Point2 {
  const displayedArea = enabledElement.viewport.displayedArea;

  return [(displayedArea?.tlhc.x ?? 1) - 1, (displayedArea?.tlhc.y ?? 1) - 1];
}

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
  const [sourceX, sourceY] = getDisplayedAreaSource(enabledElement);
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const imageX = px + sourceX - 0.5;
  const imageY = py + sourceY - 0.5;

  vec3.scaleAndAdd(worldPos, origin, iVector, imageX * spacing[0]);
  vec3.scaleAndAdd(worldPos, worldPos, jVector, imageY * spacing[1]);

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
  const [sourceX, sourceY] = getDisplayedAreaSource(enabledElement);
  const diff = vec3.subtract(vec3.create(), worldPos, origin);
  const indexPoint: Point2 = [
    vec3.dot(diff, iVector) / spacing[0] + 0.5 - sourceX,
    vec3.dot(diff, jVector) / spacing[1] + 0.5 - sourceY,
  ];

  return pixelToCanvas(enabledElement, indexPoint);
}
