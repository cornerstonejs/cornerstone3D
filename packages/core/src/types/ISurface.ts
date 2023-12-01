import Point3 from './Point3';

export interface ISurface {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  getColor(): Point3;
  getPoints(): number[];
  getPolys(): number[];
  getSizeInBytes(): number;
}
