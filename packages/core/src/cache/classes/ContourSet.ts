import { Point3, IContourSet, ContourData } from '../../types';
import Contour from './Contour';

/**
 * This class represents a set of contours.
 * Usually contours are grouped together in a contour set to represent a meaningful shape.
 */
export class ContourSet implements IContourSet {
  readonly id: string;
  readonly sizeInBytes: number;
  private color: Point3 = [200, 0, 0]; // default color
  contours: Contour[];

  constructor(props: { id: string; data: ContourData[]; color?: Point3 }) {
    this.id = props.id;
    this.contours = [];
    this.color = props.color ?? this.color;

    this._createEachContour(props.data);
    this.sizeInBytes = this._getSizeInBytes();
  }

  _createEachContour(contourDataArray: ContourData[]): void {
    this.contours = contourDataArray.map((contourData, index) => {
      const { points, type, color } = contourData;
      return new Contour({
        id: `${this.id}-${index}`,
        data: {
          points,
          type,
        },
        color: color ?? this.color,
      });
    });
  }

  _getSizeInBytes(): number {
    let sizeInBytes = 0;
    this.contours.forEach((contour) => {
      sizeInBytes += contour.sizeInBytes;
    });

    return sizeInBytes;
  }

  public getColor(): Point3 {
    // Currently, all contours in a contour set have the same color.
    // This may change in the future.
    return this.color;
  }

  /**
   * This function returns the contours of the image
   * @returns The contours of the image.
   */
  public getContours(): Contour[] {
    return this.contours;
  }

  /**
   * It returns an array of all the points in the glyph
   * @returns An array of points.
   */
  public getFlatPointsArray(): Point3[] {
    const flatPoints = [];
    this.contours.forEach((contour) => {
      flatPoints.push(...contour.getPoints());
    });
    return flatPoints;
  }

  /**
   * This function returns the number of contours in the current shape.
   * @returns The number of contours in the glyph.
   */
  public getNumberOfContours(): number {
    return this.contours.length;
  }

  /**
   * It loops through each contour in the `contours` array, and adds the number of
   * points in each contour to the `numberOfPoints` variable
   * @returns The number of points in the contours.
   */
  public getTotalNumberOfPoints(): number {
    let numberOfPoints = 0;
    this.contours.forEach((contour) => {
      numberOfPoints += contour.getPoints().length;
    });
    return numberOfPoints;
  }

  /**
   * It returns an array of the number of points in each contour.
   * @returns An array of numbers.
   */
  public getNumberOfPointsArray(): number[] {
    const numberOfPointsArray = [];
    this.contours.forEach((_, index) => {
      numberOfPointsArray[index] = this.getNumberOfPointsInAContour(index);
    });
    return numberOfPointsArray;
  }

  /**
   * It returns the points in a contour.
   * @param contourIndex - The index of the contour you want to get the
   * points from.
   * @returns An array of Point3 objects.
   */
  public getPointsInAContour(contourIndex: number): Point3[] {
    return this.contours[contourIndex].getPoints();
  }
  /**
   * "This function returns the number of points in a contour."
   *
   * @param contourIndex - The index of the contour you want to get the
   * number of points from.
   * @returns The number of points in the contour.
   */
  public getNumberOfPointsInAContour(contourIndex: number): number {
    return this.getPointsInAContour(contourIndex).length;
  }

  /**
  public convertToClosedSurface(): ClosedSurface {
    const flatPointsArray = this.getFlatPointsArray();
    const numPointsArray = this.getNumberOfPointsArray();

    const closedSurfaceData = polySeg.convertToClosedSurface(
      flatPointsArray,
      numPointsArray
    );

    const closedSurface = new ClosedSurface({
      id: this.id,
      data: closedSurfaceData,
      color: this.color,
    });

    // cache the closed surface
    return closedSurface;
  }
   */
}

export default Contour;
