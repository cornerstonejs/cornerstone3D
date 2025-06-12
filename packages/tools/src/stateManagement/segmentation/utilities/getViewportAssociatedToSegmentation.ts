import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import type { ContourSegmentationAnnotation } from '../../../types';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { getViewportIdsWithSegmentation } from '../getViewportIdsWithSegmentation';

/**
 * Gets all viewports associated with a given segmentation ID.
 * Returns all viewports that contain the segmentation.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @returns Array of viewports associated with the segmentation, or empty array if none found
 */
export function getViewportsAssociatedToSegmentation(
  segmentationId: string
): Types.IViewport[] {
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);
  if (viewportIds?.length === 0) {
    return [];
  }

  const viewports: Types.IViewport[] = [];
  for (const viewportId of viewportIds) {
    const { viewport } = getEnabledElementByViewportId(viewportId) || {};
    if (viewport) {
      viewports.push(viewport);
    }
  }
  return viewports;
}

/**
 * Gets the viewport associated with a given segmentation ID.
 * Returns the first viewport that contains the segmentation.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @returns The viewport associated with the segmentation, or undefined if not found
 */
export function getViewportAssociatedToSegmentation(segmentationId: string) {
  const viewports = getViewportsAssociatedToSegmentation(segmentationId);
  return viewports.length > 0 ? viewports[0] : undefined;
}

/**
 * Finds the viewport with a camera viewPlaneNormal that matches the annotation's viewPlaneNormal.
 * Compares the viewPlaneNormal from annotation metadata with each viewport's camera viewPlaneNormal using dot product.
 *
 * @param viewports - Array of viewports to search through
 * @param annotation - The annotation containing metadata with viewPlaneNormal
 * @param dotThreshold - The threshold for dot product comparison (default: 0.99, closer to 1.0 means more similar)
 * @returns The first viewport with matching viewPlaneNormal, or undefined if none found
 */
export function getViewportWithMatchingViewPlaneNormal(
  viewports: Types.IViewport[],
  annotation: ContourSegmentationAnnotation,
  dotThreshold: number = 0.99
): Types.IViewport | undefined {
  const annotationViewPlaneNormal = annotation.metadata?.viewPlaneNormal;

  if (!annotationViewPlaneNormal || !Array.isArray(annotationViewPlaneNormal)) {
    return undefined;
  }

  // Normalize the annotation viewPlaneNormal
  const normalizedAnnotationNormal = vec3.create();
  vec3.normalize(normalizedAnnotationNormal, annotationViewPlaneNormal as vec3);

  for (const viewport of viewports) {
    const camera = viewport.getCamera();
    if (!camera?.viewPlaneNormal) {
      continue;
    }

    // Normalize the camera viewPlaneNormal
    const normalizedCameraNormal = vec3.create();
    vec3.normalize(normalizedCameraNormal, camera.viewPlaneNormal as vec3);

    // Calculate the dot product of the normalized vectors
    const dotProduct = vec3.dot(
      normalizedAnnotationNormal,
      normalizedCameraNormal
    );

    // Use absolute value to handle both parallel and anti-parallel vectors
    if (Math.abs(dotProduct) >= dotThreshold) {
      return viewport;
    }
  }

  return undefined;
}
