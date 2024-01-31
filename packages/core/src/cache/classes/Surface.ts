import { SurfaceData, Point3, ISurface, Color, RGB } from '../../types';

type SurfaceProps = {
  id: string;
  data: SurfaceData;
  frameOfReferenceUID: string;
  color?: Point3;
};

/**
 * Surface class for storing surface data
 */
export class Surface implements ISurface {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  private color: RGB = [200, 0, 0]; // default color
  private points: number[];
  private polys: number[];

  constructor(props: SurfaceProps) {
    this.id = props.id;
    this.points = props.data.points;
    this.polys = props.data.polys;
    this.color = props.color ?? this.color;
    this.frameOfReferenceUID = props.frameOfReferenceUID;
    this.sizeInBytes = this._getSizeInBytes();
  }

  _getSizeInBytes(): number {
    return this.points.length * 4 + this.polys.length * 4;
  }

  public getColor(): RGB {
    return this.color;
  }

  public getPoints(): number[] {
    return this.points;
  }

  public getPolys(): number[] {
    return this.polys;
  }

  public setColor(color: RGB): void {
    this.color = color;
  }

  public setPoints(points: number[]): void {
    this.points = points;
  }

  public setPolys(polys: number[]): void {
    this.polys = polys;
  }

  public getSizeInBytes(): number {
    return this.sizeInBytes;
  }
}
