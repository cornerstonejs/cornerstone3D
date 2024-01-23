import getInterpolationData from './getInterpolationData';
import type { InterpolationViewportData } from '../../../types/InterpolationTypes';
import type { FilterParam } from './getInterpolationData';

/**
 * getInterpolationDataCollection - Gets the array of annotations which match the
 * filter parameters.
 *
 * @param viewportData - the annotation/viewport to start the interpolation from
 * @param filterParams - A selector for annotations for interpolation
 * @param onlyAnnotationImage - boolean, if true include interpolated annotation existing images only.
 * @returns object[], The list of interpolated locations in the stack.
 */

export default function getInterpolationDataCollection(
  viewportData: InterpolationViewportData,
  filterParams: FilterParam[],
  onlyAnnotationImage = false
) {
  const imageAnnotations = getInterpolationData(
    viewportData,
    filterParams,
    onlyAnnotationImage
  );
  const interpolatedDataCollection = [];
  (imageAnnotations || []).forEach((annotationsOnSlice) => {
    (annotationsOnSlice.annotations || []).forEach((annotation) => {
      interpolatedDataCollection.push(annotation);
    });
  });
  return interpolatedDataCollection;
}
