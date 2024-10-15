import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import cache from '../cache/cache';
import { GeometryType } from '../enums';
import type {
  IGeometry,
  PublicContourSetData,
  PublicSurfaceData,
  IGeometryLoadObject,
  GeometryLoaderFn,
} from '../types';
import { createContourSet } from './utils/contourSet/createContourSet';
import { createSurface } from './utils/surface/createSurface';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';

interface GeometryOptions {
  type: GeometryType;
  geometryData: PublicContourSetData | PublicSurfaceData;
  sizeInBytes?: number;
  segmentIndex?: number;
}

const geometryLoaders = {};
let unknownGeometryLoader;

/**
 * Load a geometry using a registered Cornerstone Geometry Loader.
 *
 * The geometry loader that is used will be
 * determined by the geometry loader scheme matching against the geometryId.
 *
 * @param geometryId - A Cornerstone Geometry Object's geometryId
 * @param options - Options to be passed to the Geometry Loader.
 *
 * @returns An Object which can be used to act after a geometry is loaded or loading fails
 *
 */
function loadGeometryFromGeometryLoader(
  geometryId: string,
  options?: GeometryOptions
): IGeometryLoadObject {
  const colonIndex = geometryId.indexOf(':');
  const scheme = geometryId.substring(0, colonIndex);
  let loader = geometryLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (
      unknownGeometryLoader == null ||
      typeof unknownGeometryLoader !== 'function'
    ) {
      throw new Error(
        `No geometry loader for scheme ${scheme} has been registered`
      );
    }

    loader = unknownGeometryLoader;
  }

  const geometryLoadObject = loader(geometryId, options);

  // Broadcast a geometry loaded event once the geometry is loaded
  geometryLoadObject.promise.then(
    function (geometry) {
      triggerEvent(eventTarget, Events.GEOMETRY_LOADED, { geometry });
    },
    function (error) {
      const errorObject = {
        geometryId,
        error,
      };

      triggerEvent(eventTarget, Events.GEOMETRY_LOADED_FAILED, errorObject);
    }
  );

  return geometryLoadObject;
}

/**
 * Loads a geometry given a geometryId and optional options and returns a promise which will resolve to
 * the loaded geometry object or fail if an error occurred. The loaded geometry is not stored in the cache.
 *
 * @param geometryId - A Cornerstone Geometry Object's geometryId
 * @param options - Options to be passed to the Geometry Loader
 *
 * @returns An Object which can be used to act after a geometry is loaded or loading fails
 */
export function loadGeometry(
  geometryId: string,
  options?: GeometryOptions
): Promise<IGeometry> {
  if (geometryId === undefined) {
    throw new Error('loadGeometry: parameter geometryId must not be undefined');
  }

  let geometryLoadObject = cache.getGeometryLoadObject(geometryId);

  if (geometryLoadObject !== undefined) {
    return geometryLoadObject.promise;
  }

  geometryLoadObject = loadGeometryFromGeometryLoader(geometryId, options);

  return geometryLoadObject.promise;
}

/**
 * Loads a geometry given a geometryId and optional options and returns a promise which will resolve to
 * the loaded geometry object or fail if an error occurred. The geometry is stored in the cache.
 *
 * @param geometryId - A Cornerstone Geometry Object's geometryId
 * @param options - Options to be passed to the Geometry Loader
 *
 * @returns Geometry Loader Object
 */
export async function createAndCacheGeometry(
  geometryId: string,
  options?: GeometryOptions
): Promise<IGeometry> {
  if (geometryId === undefined) {
    throw new Error(
      'createAndCacheGeometry: parameter geometryId must not be undefined'
    );
  }

  let geometryLoadObject = cache.getGeometryLoadObject(geometryId);

  if (geometryLoadObject !== undefined) {
    return geometryLoadObject.promise;
  }

  geometryLoadObject = loadGeometryFromGeometryLoader(geometryId, options);

  await cache.putGeometryLoadObject(geometryId, geometryLoadObject);

  return geometryLoadObject.promise;
}

/**
 * Creates and caches a geometry synchronously
 *
 * @param geometryId - A Cornerstone Geometry Object's geometryId
 * @param options - Options to be passed to the Geometry Loader
 *
 * @returns IGeometry
 */
export function createAndCacheLocalGeometry(
  geometryId: string,
  options: GeometryOptions
): IGeometry {
  if (geometryId === undefined) {
    throw new Error(
      'createAndCacheLocalGeometry: parameter geometryId must not be undefined'
    );
  }

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
    throw new Error('Unknown geometry type');
  }

  cache.putGeometrySync(geometryId, geometry);

  return geometry;
}

/**
 * Registers a geometryLoader plugin with cornerstone for the specified scheme
 *
 * @param scheme - The scheme to use for this geometry loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param geometryLoader - A Cornerstone Geometry Loader function
 */
export function registerGeometryLoader(
  scheme: string,
  geometryLoader: GeometryLoaderFn
): void {
  geometryLoaders[scheme] = geometryLoader;
}

/**
 * Registers a new unknownGeometryLoader and returns the previous one
 *
 * @param geometryLoader - A Cornerstone Geometry Loader
 *
 * @returns The previous Unknown Geometry Loader
 */
export function registerUnknownGeometryLoader(
  geometryLoader: GeometryLoaderFn
): GeometryLoaderFn | undefined {
  const oldGeometryLoader = unknownGeometryLoader;

  unknownGeometryLoader = geometryLoader;

  return oldGeometryLoader;
}
