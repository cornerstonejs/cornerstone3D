import getInterpolationData from './getInterpolationData';
import type { InterpolationViewportData } from '../../../types';
import type { InterpolationROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import type { FilterParam } from './getInterpolationData';

/**
 * getInterpolationDataCollection - Gets the array of annotations which match the
 * filter parameters, mapped by slice index.
 *
 * @param viewportData - the annotation/viewport to start the interpolation from
 * @param filterParams - A selector for annotations for interpolation
 * @param onlyAnnotationImage - boolean, if true include interpolated annotation existing images only.
 * @returns The list of interpolated locations in the stack.
 */

export default function getInterpolationDataCollection(
  viewportData: InterpolationViewportData,
  filterParams: FilterParam[]
): InterpolationROIAnnotation[] {
  const imageAnnotations = getInterpolationData(viewportData, filterParams);
  const interpolatedDataCollection = [];
  if (!imageAnnotations?.size) {
    return interpolatedDataCollection;
  }
  for (const annotations of imageAnnotations.values()) {
    annotations.forEach((annotation) => {
      interpolatedDataCollection.push(annotation);
    });
  }
  return interpolatedDataCollection;
}
