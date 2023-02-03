import { IGeometry, PublicSurfaceData } from '../../../types';
import { GeometryType } from '../../../enums';
import { validateSurface } from './validateSurface';
import { Surface } from '../../../cache/classes/Surface';

export function createSurface(
  geometryId: string,
  SurfaceData: PublicSurfaceData
) {
  // validate the data to make sure it is a valid contour set
  validateSurface(SurfaceData);

  const surface = new Surface({
    id: SurfaceData.id,
    color: SurfaceData.color,
    frameOfReferenceUID: SurfaceData.frameOfReferenceUID,
    data: {
      points: SurfaceData.data.points,
      polys: SurfaceData.data.polys,
    },
  });

  const geometry: IGeometry = {
    id: geometryId,
    type: GeometryType.SURFACE,
    data: surface,
    sizeInBytes: surface.getSizeInBytes(),
  };

  return geometry;
}
