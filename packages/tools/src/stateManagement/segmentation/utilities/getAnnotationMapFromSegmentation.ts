import type { Types } from '@cornerstonejs/core';
import { getAnnotation } from '../../annotation/annotationState';
import type * as ToolsTypes from '../../../types';

export type MapOptions = {
  segmentIndices?: number[];
  segmentationId?: string;
  viewport?: Types.IStackViewport | Types.IVolumeViewport;
};

export type AnnotationInfo = {
  polyline: Types.Point3[];
  isClosed: boolean;
  annotationUID: string;
  referencedImageId: string;
  holesPolyline: Types.Point3[][];
  holesUIDs: string[];
  holesClosed: boolean[];
};

export function getAnnotationMapFromSegmentation(
  contourRepresentationData: ToolsTypes.ContourSegmentationData,
  options: MapOptions = {}
) {
  const annotationMap = contourRepresentationData.annotationUIDsMap;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : Array.from(annotationMap.keys());

  const annotationUIDsInSegmentMap = new Map<number, unknown>();
  segmentIndices.forEach((index) => {
    const annotationUIDsInSegment = annotationMap.get(index);

    // Todo: there is a bug right now where the annotationUIDsInSegment has both
    // children and parent annotations, so we need to filter out the parent
    // annotations only

    let uids = Array.from(annotationUIDsInSegment);

    uids = uids.filter(
      (uid) =>
        !(getAnnotation(uid) as ToolsTypes.Annotation).parentAnnotationUID
    );

    const annotations = uids.map((uid) => {
      const annotation = getAnnotation(uid) as ToolsTypes.ContourAnnotation;
      const hasChildAnnotations = annotation.childAnnotationUIDs?.length;
      const childPolylinesInformation =
        hasChildAnnotations &&
        annotation.childAnnotationUIDs.map((childUID) => {
          const childAnnotation = getAnnotation(
            childUID
          ) as ToolsTypes.ContourAnnotation;
          return {
            polyline: childAnnotation.data.contour.polyline,
            isClosed: childAnnotation.data.contour.closed,
          };
        });
      const holesClosed =
        hasChildAnnotations &&
        childPolylinesInformation.map((childInfo) => childInfo.isClosed);

      const childPolylines =
        hasChildAnnotations &&
        childPolylinesInformation.map((childInfo) => childInfo.polyline);

      return {
        polyline: annotation.data.contour.polyline,
        isClosed: annotation.data.contour.closed,
        annotationUID: annotation.annotationUID,
        referencedImageId: annotation.metadata.referencedImageId,
        holesPolyline: childPolylines,
        holesUIDs: annotation.childAnnotationUIDs,
        holesClosed,
      };
    });

    annotationUIDsInSegmentMap.set(index, annotations);
  });

  return { segmentIndices, annotationUIDsInSegmentMap };
}
