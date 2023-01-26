import { Point3, ContourData, IContour } from '../../types';
import { ContourType } from '../../enums';

export class Contour implements IContour {
  readonly id: string;
  readonly sizeInBytes: number;
  points: Point3[];
  color: Point3;
  type: ContourType;

  constructor(props: { id: string; data: ContourData; color: Point3 }) {
    const { points, type } = props.data;
    this.id = props.id;
    this.points = points;
    this.type = type;
    this.color = props.color;

    this.sizeInBytes = this._getSizeInBytes();
  }

  _getSizeInBytes(): number {
    let sizeInBytes = 0;

    // Assuming each point is 1 byte
    sizeInBytes += this.points.length * 3;
    return sizeInBytes;
  }

  /**
   * It returns the value of the points property of the data object
   * @returns The points property of the data object.
   */
  public getPoints(): Point3[] {
    return this.points;
  }

  public getFlatPointsArray(): number[] {
    const flatPointsArray: number[] = [];
    this.points.forEach((point) => {
      flatPointsArray.push(point[0], point[1], point[2]);
    });
    return flatPointsArray;
  }

  /**
   * This function returns the color of the contour
   * @returns The color of the contour
   */
  public getColor(): Point3 {
    return this.color;
  }

  /**
   * It returns the type of the contour, closed or open
   * @returns The type of the contour.
   */
  public getType(): ContourType {
    return this.type;
  }
}

export default Contour;
