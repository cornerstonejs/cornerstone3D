import type {
  InterpolationViewportData,
  Annotation,
  ContourSegmentationAnnotation,
} from '../../../types';
import { getAnnotations } from '../../../stateManagement/annotation/annotationState';

const DEFAULT_CONTOUR_SEG_TOOLNAME = 'PlanarFreehandContourSegmentationTool';

export type FilterParam = {
  /**
   * Selects a parent value from the given annotation to get the comparison values from.
   * Was originally a key name, but this became too limited to match multiple levels
   * of selection, so was changed to a function returning the values.
   */
  parentKey?: (annotation) => any;

  /**
   * The attribute to extract the value from the parent object, compared with
   * value to see if the filter matches.
   */
  key: string;

  /**
   * The comparison value to compare against.  If an array, will compare sub-values.
   */
  value: unknown;
};

/**
 * getInterpolationData - Gets the list of the slice locations of the 2D
 * polygons that make up the interpolated annotation, along with the annotations
 * which match the specified filterParams on that slice.
 *
 * @param viewportData - the annotation/viewport to start the interpolation from
 * @param filterParams - A selector for annotations for interpolation
 * @returns The list of interpolated locations in the stack
 */

export default function getInterpolationData(
  viewportData: InterpolationViewportData,
  filterParams = []
): Map<number, Annotation[]> {
  const { viewport, sliceData, annotation } = viewportData;
  const interpolationDatas = new Map<number, Annotation[]>();
  const { toolName, originalToolName } = annotation.metadata;
  const testToolName = originalToolName || toolName;
  // Get a copy of the annotations list by filtering it for only
  // items which are originally the right tool name
  const annotations = (
    (getAnnotations(
      testToolName,
      viewport.element
    ) as ContourSegmentationAnnotation[]) || []
  ).filter(
    (annotation) =>
      !annotation.metadata.originalToolName ||
      annotation.metadata.originalToolName === testToolName
  );

  // Then add the default contour seg tool name which has the testTool name
  // to the segmentations list.
  if (testToolName !== DEFAULT_CONTOUR_SEG_TOOLNAME) {
    const modifiedAnnotations = getAnnotations(
      DEFAULT_CONTOUR_SEG_TOOLNAME,
      viewport.element
    ) as ContourSegmentationAnnotation[];
    if (modifiedAnnotations?.length) {
      modifiedAnnotations.forEach((annotation) => {
        const { metadata } = annotation;
        if (
          metadata.originalToolName === testToolName &&
          metadata.originalToolName !== metadata.toolName
        ) {
          annotations.push(annotation);
        }
      });
    }
  }

  if (!annotations?.length) {
    return interpolationDatas;
  }

  for (let i = 0; i < sliceData.numberOfSlices; i++) {
    const imageAnnotations = annotations.filter(
      (x) => x.metadata.sliceIndex === i
    );

    if (!imageAnnotations?.length) {
      continue;
    }

    const filteredInterpolatedAnnotations = imageAnnotations.filter(
      (imageAnnotation) => {
        return filterParams.every((x) => {
          const parent = x.parentKey
            ? x.parentKey(imageAnnotation)
            : imageAnnotation;
          const value = parent?.[x.key];
          if (Array.isArray(value)) {
            return value.every((item, index) => item === x.value[index]);
          }
          return value === x.value;
        });
      }
    );

    if (filteredInterpolatedAnnotations.length) {
      interpolationDatas.set(i, filteredInterpolatedAnnotations);
    }
  }

  return interpolationDatas;
}
