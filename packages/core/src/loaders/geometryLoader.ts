import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import cache from '../cache';
import { ContourSet } from '../cache/classes/ContourSet';
import { GeometryType } from '../enums';
import { IGeometry, PublicContourSetData } from '../types';

type GeometryOptions = {
  type: GeometryType;
  geometryData: PublicContourSetData; // | PublicClosedSurfaceData, ...
};

/**
 * Todo: currently we are not targeting loading geometry from a file.
 * This is a placeholder for future work. For instance, separate loaders
 * for .vti, .vtk, .obj, .dat etc. can be created and registered here.
 */

/**
 * It creates a geometry object and caches it
 * @param geometryId - A unique identifier for the geometry.
 * @param options - GeometryOptions
 * @returns A promise that resolves to a geometry object.
 */
async function createAndCacheGeometry(
  geometryId: string,
  options: GeometryOptions
): Promise<IGeometry> {
  let geometry = cache.getGeometry(geometryId);

  if (geometry) {
    return geometry;
  }

  if (options.type === GeometryType.CONTOUR) {
    geometry = _createContourSet(geometryId, options.geometryData);
  } else {
    throw new Error('Unknown geometry type, Only CONTOUR is supported');
  }

  const geometryLoadObject = {
    promise: Promise.resolve(geometry),
  };

  await cache.putGeometryLoadObject(geometryId, geometryLoadObject);

  return geometry;
}

// Todo: this should be moved
function _createContourSet(
  geometryId: string,
  contourSetData: PublicContourSetData
) {
  // validate the data to make sure it is a valid contour set
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

  const contourSet = new ContourSet({
    id: contourSetData.id,
    data: contourSetData.data,
    color: contourSetData.color,
    frameOfReferenceUID: contourSetData.frameOfReferenceUID,
  });

  const geometry: IGeometry = {
    id: geometryId,
    type: GeometryType.CONTOUR,
    data: contourSet,
    sizeInBytes: contourSet.getSizeInBytes(),
  };

  return geometry;
}

export { createAndCacheGeometry };
