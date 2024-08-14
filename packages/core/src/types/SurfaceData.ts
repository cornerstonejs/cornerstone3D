import type Point3 from './Point3';

interface PublicSurfaceData {
  id: string;
  data: SurfaceData;
  frameOfReferenceUID: string;
  color?: Point3;
}

interface SurfaceData {
  points: number[];
  polys: number[];
}

export type { PublicSurfaceData, SurfaceData };
