import Point3 from './Point3';

type PublicSurfaceData = {
  id: string;
  data: SurfaceData;
  frameOfReferenceUID: string;
  color?: Point3;
};

type SurfaceData = {
  points: number[];
  polys: number[];
};

export type { PublicSurfaceData, SurfaceData };
