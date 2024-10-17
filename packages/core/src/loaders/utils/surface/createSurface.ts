import type { IGeometry, PublicSurfaceData } from '../../../types';
import { GeometryType } from '../../../enums';
import { validateSurface } from './validateSurface';
import { Surface } from '../../../cache/classes/Surface';

export function createSurface(
  geometryId: string,
  surfaceData: PublicSurfaceData
) {
  // validate the data to make sure it is a valid surface
  validateSurface(surfaceData);

  const surface = new Surface({
    id: surfaceData.id,
    points: surfaceData.points,
    polys: surfaceData.polys,
    color: surfaceData.color,
    frameOfReferenceUID: surfaceData.frameOfReferenceUID,
    segmentIndex: surfaceData.segmentIndex ?? 1,
  });

  const geometry: IGeometry = {
    id: geometryId,
    type: GeometryType.SURFACE,
    data: surface,
    sizeInBytes: surface.sizeInBytes,
  };

  return geometry;
}
