import { SurfaceData, Point3 } from '../../types';

type SurfaceProps = {
  id: string;
  data: SurfaceData;
  frameOfReferenceUID: string;
  color?: Point3;
};

/**
 * Surface class for storing surface data
 */
export class Surface {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  private color: Point3 = [200, 0, 0]; // default color
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

  public getColor(): Point3 {
    return this.color;
  }

  public getPoints(): number[] {
    return this.points;
  }

  public getPolys(): number[] {
    return this.polys;
  }

  public getSizeInBytes(): number {
    return this.sizeInBytes;
  }
}
