import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import cache from '../cache';
import { GeometryType } from '../enums';
import { IGeometry, PublicContourSetData, PublicSurfaceData } from '../types';
import { createContourSet } from './utils/contourSet/createContourSet';
import { createSurface } from './utils/surface/createSurface';

type GeometryOptions = {
  type: GeometryType;
  geometryData: PublicContourSetData | PublicSurfaceData;
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
    geometry = createContourSet(
      geometryId,
      options.geometryData as PublicContourSetData
    );
  } else if (options.type === GeometryType.SURFACE) {
    geometry = createSurface(
      geometryId,
      options.geometryData as PublicSurfaceData
    );
  } else {
    throw new Error('Unknown geometry type, Only CONTOUR is supported');
  }

  const geometryLoadObject = {
    promise: Promise.resolve(geometry),
  };

  await cache.putGeometryLoadObject(geometryId, geometryLoadObject);

  return geometry;
}

export { createAndCacheGeometry };
