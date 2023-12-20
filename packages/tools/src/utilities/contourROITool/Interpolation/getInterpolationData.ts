import type {
  InterpolationViewportData,
  ImageInterpolationData,
} from './InterpolationTypes';
import * as annotationStateManagement from '../../../stateManagement/annotation';
import { InterpolationROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';

/**
 * getInterpolationData - Generates a list of the slice locations of the 2D
 * polygons that make up the interpolated annotation.
 *
 * @param imageIds - String[], An array of Image Ids.
 * @param filterParams - object,  \{key: propertyName to compare, value: value of property, parentKey: to specify inner key\}.
 * @param onlyAnnotationImage - boolean, if true include interpolated annotation existing images only.
 * @returns object[], The list of interpolated locations in the stack.
 */

export default function getInterpolationData(
  viewportData: InterpolationViewportData,
  filterParams = [],
  onlyAnnotationImage = false
) {
  const { viewport, sliceData, annotation } = viewportData;
  const interpolationDatas: ImageInterpolationData[] = [];
  const annotations = annotationStateManagement.state.getAnnotations(
    annotation.metadata.toolName,
    viewport.element
  );

  for (let i = 0; i < sliceData.numberOfSlices; i++) {
    const imageAnnotations = annotations.filter(
      (x) =>
        (x as InterpolationROIAnnotation).metadata.referencedSliceIndex === i
    );

    if (!imageAnnotations || !imageAnnotations.length) {
      if (!onlyAnnotationImage) {
        interpolationDatas.push({
          sliceIndex: i,
        });
      }
    } else {
      const filteredInterpolatedAnnotations = imageAnnotations.filter(
        (imageAnnotation) => {
          return filterParams.every((x) => {
            if (x.parentKey && imageAnnotation[x.parentKey][x.key]) {
              if (Array.isArray(imageAnnotation[x.parentKey][x.key])) {
                return imageAnnotation[x.parentKey][x.key].every(
                  (item, index) => item === x.value[index]
                );
              }
              return imageAnnotation[x.parentKey][x.key] === x.value;
            }
            return imageAnnotation[x.key] === x.value;
          });
        }
      );

      const annotationsOnImage: ImageInterpolationData = {
        sliceIndex: i,
        annotations: filteredInterpolatedAnnotations.length
          ? filteredInterpolatedAnnotations
          : undefined,
      };

      interpolationDatas.push(annotationsOnImage);
    }
  }

  return interpolationDatas;
}
