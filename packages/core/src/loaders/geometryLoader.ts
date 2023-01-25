import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import cache from '../cache';
import { ContourSet } from '../cache/classes/ContourSet';
import { GeometryType } from '../enums';
import { IGeometry, PublicContourSetData } from '../types';

type GeometryOptions = {
  type: GeometryType;
  data: PublicContourSetData; // | PublicClosedSurfaceData, ...
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
    geometry = _createContourSet(geometryId, options.data);
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
function _createContourSet(geometryId: string, data: PublicContourSetData) {
  // validate the data to make sure it is a valid contour set
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error(
      'Invalid contour set data, see publicContourSetData type for more info'
    );
  }

  // make sure it has points
  if (!data[0].points || !Array.isArray(data[0].points)) {
    throw new Error(
      'ContourSet points are not valid, see publicContourSetData type for more info'
    );
  }

  // make sure it has type
  if (!data[0].type) {
    throw new Error(
      'ContourSet type is not valid, see publicContourSetData type for more info'
    );
  }

  const contourSet = new ContourSet({
    id: geometryId,
    data,
  });
  return contourSet;
}

export { createAndCacheGeometry };
