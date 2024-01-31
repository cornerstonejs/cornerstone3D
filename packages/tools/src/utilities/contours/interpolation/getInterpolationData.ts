import type { InterpolationViewportData, Annotation } from '../../../types';
import { getAnnotations } from '../../../stateManagement/annotation/annotationState';
import { InterpolationROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';

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
  const annotations = getAnnotations(
    annotation.metadata.toolName,
    viewport.element
  );

  for (let i = 0; i < sliceData.numberOfSlices; i++) {
    const imageAnnotations = annotations.filter(
      (x) =>
        (x as InterpolationROIAnnotation).metadata.referencedSliceIndex === i
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

    interpolationDatas.set(i, filteredInterpolatedAnnotations);
  }

  return interpolationDatas;
}
