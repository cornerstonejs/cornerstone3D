import { IGeometry, PublicContourSetData } from '../../../types';
import { GeometryType } from '../../../enums';
import { validateContourSet } from './validateContourSet';
import { ContourSet } from '../../../cache/classes/ContourSet';

export function createContourSet(
  geometryId: string,
  contourSetData: PublicContourSetData
) {
  // validate the data to make sure it is a valid contour set
  validateContourSet(contourSetData);

  const contourSet = new ContourSet({
    id: contourSetData.id,
    data: contourSetData.data,
    color: contourSetData.color,
    frameOfReferenceUID: contourSetData.frameOfReferenceUID,
    segmentIndex: contourSetData.segmentIndex ?? 1,
  });

  const geometry: IGeometry = {
    id: geometryId,
    type: GeometryType.CONTOUR,
    data: contourSet,
    sizeInBytes: contourSet.getSizeInBytes(),
  };

  return geometry;
}
