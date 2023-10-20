import { PublicContourSetData } from '../../../types';

export function validateContourSet(contourSetData: PublicContourSetData) {
  if (!contourSetData || contourSetData.data.length === 0) {
    throw new Error(
      'Invalid contour set data, see publicContourSetData type for more info'
    );
  }

  // make sure it each has id, and each has data of type Point3[]
  if (!contourSetData.id) {
    throw new Error(
      'Invalid contour set data, each contour set must have an id'
    );
  }

  if (!contourSetData.data || !Array.isArray(contourSetData.data)) {
    throw new Error(
      'Invalid contour set data, each contour set must have an array of contours'
    );
  }

  contourSetData.data.forEach((contourData) => {
    if (!contourData.points || !Array.isArray(contourData.points)) {
      throw new Error(
        'Invalid contour set data, each contour must have an array of points'
      );
    }

    contourData.points.forEach((point) => {
      if (!point || !Array.isArray(point) || point.length !== 3) {
        throw new Error(
          'Invalid contour set data, each point must be an array of length 3'
        );
      }
    });
  });
}
