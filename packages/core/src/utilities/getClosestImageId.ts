import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import * as metaData from '../metaData';
import type { IImageVolume, Point3 } from '../types';
import { coreLog } from './logger';

import getSpacingInNormalDirection from './getSpacingInNormalDirection';
import { EPSILON } from '../constants';

const log = coreLog.getLogger('utilities', 'getClosestImageId');

/**
 * Given an image volume, a point in world space, and the view plane normal,
 * it returns the closest imageId based on the specified options.
 * If `options.ignoreSpacing` is true, it returns the imageId with the minimum
 * distance along the view plane normal, regardless of voxel spacing.
 * Otherwise, it returns the closest imageId within half voxel spacing along the normal.
 *
 * @param imageVolume - The image volume or object containing direction, spacing, and imageIds.
 * @param worldPos - The position in the world coordinate system.
 * @param viewPlaneNormal - The normal vector of the viewport.
 * @param options - Options object.
 * @param options.ignoreSpacing - If true, ignore spacing and find the absolute closest imageId.
 *
 * @returns The closest imageId based on the criteria, or undefined if none found.
 */
export default function getClosestImageId(
  imageVolume:
    | IImageVolume
    | { direction: mat3; spacing: Point3; imageIds: string[] },
  worldPos: Point3,
  viewPlaneNormal: Point3,
  options?: { ignoreSpacing?: boolean }
): string | undefined {
  const { direction, spacing, imageIds } = imageVolume;
  const { ignoreSpacing = false } = options || {};

  if (!imageIds?.length) {
    return;
  }

  // 1. Get ScanAxis vector (normal to the image plane)
  const kVector = direction.slice(6, 9) as Point3;

  // 2. Check if scanAxis is parallel to camera viewPlaneNormal
  // If not, the view is not aligned with the image plane, so return early.
  const dotProduct = vec3.dot(kVector, viewPlaneNormal);
  if (Math.abs(dotProduct) < 1 - EPSILON) {
    return;
  }

  // 3. Calculate spacing in the normal direction if needed
  let halfSpacingInNormalDirection: number | undefined;
  if (!ignoreSpacing) {
    const spacingInNormalDirection = getSpacingInNormalDirection(
      { direction, spacing },
      viewPlaneNormal
    );
    halfSpacingInNormalDirection = spacingInNormalDirection / 2;
  }

  let closestImageId: string | undefined;
  let minDistance = Infinity;

  // 4. Iterate over all imageIds to find the closest one
  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i];

    // 4.a Get metadata for the imageId
    const imagePlaneModule = metaData.get('imagePlaneModule', imageId);
    if (!imagePlaneModule?.imagePositionPatient) {
      log.warn(`Missing imagePositionPatient for imageId: ${imageId}`);
      continue; // Skip if essential metadata is missing
    }
    const { imagePositionPatient } = imagePlaneModule;

    // 4.b Calculate the direction vector from the world point to the image origin
    const dir = vec3.create();
    vec3.sub(dir, worldPos, imagePositionPatient);

    // 4.c Calculate the projected distance along the view plane normal
    const distance = Math.abs(vec3.dot(dir, viewPlaneNormal));

    // 4.d Check if this imageId is the closest one found so far based on options
    if (ignoreSpacing) {
      if (distance < minDistance) {
        minDistance = distance;
        closestImageId = imageId;
      }
    } else {
      // Check if within half spacing and closer than the current minimum
      if (distance < halfSpacingInNormalDirection && distance < minDistance) {
        minDistance = distance;
        closestImageId = imageId;
      }
    }
  }

  if (closestImageId === undefined) {
    log.warn(
      'No imageId found within the specified criteria (half spacing or absolute closest).'
    );
  }

  return closestImageId;
}
