import type Point3 from './Point3';

type PublicSurfaceData = SurfaceData;

interface SurfaceData {
  id: string;
  points: number[];
  polys: number[];
  frameOfReferenceUID: string;
  color?: Point3;
  segmentIndex?: number;
}

export type { PublicSurfaceData, SurfaceData };
