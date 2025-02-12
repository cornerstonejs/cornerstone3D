import { geometryLoader, Enums } from '@cornerstonejs/core';
import downloadSurfaces, { downloadOneSurface } from './downloadSurfacesData';
import type { SurfaceData } from '@cornerstonejs/core/types';

/**
 * Creates and caches geometries from surfaces
 * @param surfaces - The surfaces data
 * @returns A Map of segment index to geometry ID
 *
 * Note: this is a sample function for our demo purposes, you can organize
 * the surface data as you wish but the geometryData should contain the following:
 * - points
 * - polys
 * - id
 * - segmentIndex
 * - frameOfReferenceUID
 */
function createAndCacheGeometry(surface: any, index: number): [number, string] {
  const geometryId = surface.closedSurface.id;
  geometryLoader.createAndCacheGeometry(geometryId, {
    type: Enums.GeometryType.SURFACE,
    geometryData: {
      points: surface.closedSurface.data.points,
      polys: surface.closedSurface.data.polys,
      id: surface.closedSurface.id,
      segmentIndex: index + 1,
      frameOfReferenceUID: surface.closedSurface.frameOfReferenceUID,
    } as SurfaceData,
  });

  const segmentIndex = index + 1;
  return [segmentIndex, geometryId];
}

async function processGeometries(
  surfaces: any[]
): Promise<Map<number, string>> {
  return surfaces.reduce((acc: Map<number, string>, surface, index) => {
    const [segmentIndex, geometryId] = createAndCacheGeometry(surface, index);
    acc.set(segmentIndex, geometryId);
    return acc;
  }, new Map());
}

export async function createAndCacheGeometriesFromSurfaces(): Promise<
  Map<number, string>
> {
  const surfaces = await downloadSurfaces();
  return processGeometries(surfaces);
}

export async function createAndCacheGeometriesFromOneSurface(): Promise<
  Map<number, string>
> {
  const surfaces = await downloadOneSurface();
  return processGeometries([surfaces]);
}
