import type { Annotation } from '../types';
import { StackViewport, type Types } from '@cornerstonejs/core';
import * as vec3 from 'gl-matrix/vec3';

/**
 * Moves an annotation to the current view plane by projecting its points onto the plane.
 * For each point in the annotation, calculates the projected distance from the focal point
 * to the point along the view plane normal, then moves the point by that distance in the
 * opposite direction of the normal to place it on the view plane.
 *
 * @param annotation - The annotation to move to the view plane
 * @param viewport - The viewport containing the view plane to move to
 * @returns The modified annotation with points projected onto the view plane
 */
export function moveAnnotationToViewPlane(
  annotation: Annotation,
  viewport: Types.IViewport
) {
  const { data } = annotation;
  const { points } = data.handles;

  const { focalPoint, viewPlaneNormal } = viewport.getCamera();

  // projected distance from the focal point to the point
  const projectedDistance = vec3.dot(
    vec3.sub(vec3.create(), points[0], focalPoint),
    viewPlaneNormal
  );

  // move the point in the direction of the viewPlaneNormal by the projected distance
  // annotation with all the points
  points.forEach((point) => {
    vec3.add(
      point,
      point,
      vec3.scale(
        vec3.create(),
        [-viewPlaneNormal[0], -viewPlaneNormal[1], -viewPlaneNormal[2]],
        projectedDistance
      )
    );
  });

  // we need to modify the metadata for referencedImageId if it is stack viewport
  // for volume viewport it will get taken care of by the viewport
  if (viewport instanceof StackViewport) {
    annotation.metadata.referencedImageId = viewport.getCurrentImageId();
  }

  return annotation;
}
