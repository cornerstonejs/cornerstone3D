import { cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import {
  findSegmentationRepresentationByUID,
  getSegmentation,
} from '../../stateManagement/segmentation/segmentationState';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import {
  ContourSegmentationAnnotation,
  ContourSegmentationData,
} from 'tools/src/types';
import { getAnnotation } from '../../stateManagement';
import { isPointInsidePolyline3D } from '../math/polyline';

/**
 * Get the segment at the specified world point in the viewport.
 * @param viewport - The viewport where the point resides.
 * @param worldPoint - The world point to get the segment for.
 * @param segmentationId - The ID of the segmentation to lookup.
 * @param representationType - The type of segmentation representation (labelmap, contour etc.)
 * @returns The index of the segment at the world point, or undefined if not found.
 */
export function getSegmentAtWorldPoint(
  viewport: Types.IViewport,
  worldPoint: Types.Point3,
  segmentationRepresentationUID: string
) {
  const { segmentationRepresentation } = findSegmentationRepresentationByUID(
    segmentationRepresentationUID
  );

  const { segmentationId, type } = segmentationRepresentation;
  const segmentation = getSegmentation(segmentationId);

  if (type === SegmentationRepresentations.Labelmap) {
    const representationData = segmentation.representationData.LABELMAP;
    return getSegmentAtWorldForLabelmap(
      viewport,
      worldPoint,
      representationData,
      segmentationRepresentationUID
    );
  } else if (type === SegmentationRepresentations.Contour) {
    const representationData = segmentation.representationData.CONTOUR;
    return getSegmentAtWorldForContour(
      viewport,
      worldPoint,
      representationData
    );
  } else {
    throw new Error(
      `Segmentation representation type ${type} is not supported by getSegmentAtWorldPoint.`
    );
  }
}

function getSegmentAtWorldForLabelmap(
  viewport: Types.IViewport,
  worldPoint: Types.Point3,
  labelmapData: LabelmapSegmentationData,
  segmentationRepresentationUID: string
): number | undefined {
  if (isVolumeSegmentation(labelmapData, viewport)) {
    const { volumeId } = labelmapData as LabelmapSegmentationDataVolume;
    const segmentationVolume = cache.getVolume(volumeId);

    if (!segmentationVolume) {
      return;
    }

    const segmentIndex =
      segmentationVolume.imageData.getScalarValueFromWorld(worldPoint);

    return segmentIndex;
  }

  // stack segmentation case
  const { imageIdReferenceMap } = labelmapData as LabelmapSegmentationDataStack;

  const currentImageId = (viewport as Types.IStackViewport).getCurrentImageId();

  const segmentationImageId = imageIdReferenceMap.get(currentImageId);
  const image = cache.getImage(segmentationImageId);

  if (!image) {
    return;
  }

  const segmentationActor = viewport.getActor(segmentationRepresentationUID);

  const imageData = segmentationActor?.actor.getMapper().getInputData();
  const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);

  // Since it is a stack, we don't need to check the z
  const flattenedIndex = indexIJK[0] + indexIJK[1] * image.columns;
  const scalars = imageData.getPointData().getScalars().getData();

  const segmentIndex = scalars[flattenedIndex];

  return segmentIndex;
}

function getSegmentAtWorldForContour(
  viewport: Types.IViewport,
  worldPoint: Types.Point3,
  contourData: ContourSegmentationData
): number {
  const segmentIndices = Array.from(contourData.annotationUIDsMap.keys());
  const { viewPlaneNormal } = viewport.getCamera();

  for (const segmentIndex of segmentIndices) {
    const annotationsSet = contourData.annotationUIDsMap.get(segmentIndex);

    if (!annotationsSet) {
      continue;
    }

    for (const annotationUID of annotationsSet) {
      const annotation = getAnnotation(
        annotationUID
      ) as ContourSegmentationAnnotation;

      if (!annotation) {
        continue;
      }

      const { polyline } = annotation.data.contour;

      if (
        !utilities.isEqual(viewPlaneNormal, annotation.metadata.viewPlaneNormal)
      ) {
        continue;
      }

      if (isPointInsidePolyline3D(worldPoint, polyline)) {
        return Number(segmentIndex);
      }
    }
  }
}
