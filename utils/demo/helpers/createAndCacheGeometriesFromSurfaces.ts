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
 *
 * A given frameOfReferenceUID replaces the one of the downloaded data, whose
 * surfaces carry a placeholder frame of reference.
 */
function createAndCacheGeometry(
  surface: any,
  index: number,
  frameOfReferenceUID?: string
): [number, string] {
  const geometryId = surface.closedSurface.id;
  geometryLoader.createAndCacheGeometry(geometryId, {
    type: Enums.GeometryType.SURFACE,
    geometryData: {
      points: surface.closedSurface.data.points,
      polys: surface.closedSurface.data.polys,
      id: surface.closedSurface.id,
      segmentIndex: index + 1,
      frameOfReferenceUID:
        frameOfReferenceUID ?? surface.closedSurface.frameOfReferenceUID,
    } as SurfaceData,
  });

  const segmentIndex = index + 1;
  return [segmentIndex, geometryId];
}

async function processGeometries(
  surfaces: any[],
  frameOfReferenceUID?: string
): Promise<Map<number, string>> {
  return surfaces.reduce((acc: Map<number, string>, surface, index) => {
    const [segmentIndex, geometryId] = createAndCacheGeometry(
      surface,
      index,
      frameOfReferenceUID
    );
    acc.set(segmentIndex, geometryId);
    return acc;
  }, new Map());
}

/**
 * Downloads the demo surfaces and caches them as geometries. With
 * `options.frameOfReferenceUID`, the surfaces take that frame of reference,
 * the one of the series they were made from, so that tools that match
 * frames of reference (SegmentationIntersectionTool) find them.
 */
export async function createAndCacheGeometriesFromSurfaces(options?: {
  frameOfReferenceUID?: string;
}): Promise<Map<number, string>> {
  const surfaces = await downloadSurfaces();
  return processGeometries(surfaces, options?.frameOfReferenceUID);
}

export async function createAndCacheGeometriesFromOneSurface(): Promise<
  Map<number, string>
> {
  const surfaces = await downloadOneSurface();
  return processGeometries([surfaces]);
}
