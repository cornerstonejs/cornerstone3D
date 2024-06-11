import Point3 from './Point3';

export interface ISurface {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  getColor(): Point3;
  setColor(color: Point3): void;
  getPoints(): number[];
  getPolys(): number[];
  getSizeInBytes(): number;
  setPoints(points: number[]): void;
  setPolys(polys: number[]): void;
}
