import { Point3 } from '.';
import { ContourType } from '../enums';

export interface IContour {
  readonly id: string;
  readonly sizeInBytes: number;
  points: Point3[];
  color: any;
  _getSizeInBytes(): number;
  /**
   * It returns the value of the points property of the data object
   * @returns The points property of the data object.
   */
  getPoints(): Point3[];
  getColor(): Point3;
  getType(): ContourType;
  getFlatPointsArray(): number[];
}
