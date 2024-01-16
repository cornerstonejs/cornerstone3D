import getInterpolationData from './getInterpolationData';
import type {
  InterpolationViewportData,
  ImageInterpolationData,
} from '../../../types/InterpolationTypes';

/**
 * getInterpolationDataCollection - Generates a collection of the 2D
 * polygons in difference slices that make up the interpolated annotations.
 *
 * @param eventData - Object, cornerstone viewport.
 * @param filterParams - Object, \{key: propertyName to compare, value: value of property, parentKey: \}.
 * @param onlyAnnotationImage - boolean, if true include interpolated annotation existing images only.
 * @returns object[], The list of interpolated locations in the stack.
 */

export default function getInterpolationDataCollection(
  viewportData: InterpolationViewportData,
  filterParams,
  onlyAnnotationImage = false
) {
  const imageAnnotations: ImageInterpolationData[] = getInterpolationData(
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
