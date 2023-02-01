import { Point3, IContourSet, IContour, ContourData } from '../../types';
import Contour from './Contour';

type ContourSetProps = {
  id: string;
  data: ContourData[];
  frameOfReferenceUID: string;
  color?: Point3;
};

/**
 * This class represents a set of contours in 3d space.
 * Usually contours are grouped together in a contour set to represent a meaningful shape.
 */
export class ContourSet implements IContourSet {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  private color: Point3 = [200, 0, 0]; // default color
  contours: IContour[];

  constructor(props: ContourSetProps) {
    this.id = props.id;
    this.contours = [];
    this.color = props.color ?? this.color;
    this.frameOfReferenceUID = props.frameOfReferenceUID;

    this._createEachContour(props.data);
    this.sizeInBytes = this._getSizeInBytes();
  }

  _createEachContour(contourDataArray: ContourData[]): void {
    for (let i = 0; i < contourDataArray.length; i++) {
      const contour = new Contour({
        id: `${this.id}-${i}`,
        data: {
          points: contourDataArray[i].points,
          type: contourDataArray[i].type,
        },
        color: contourDataArray[i].color ?? this.color,
      });

      this.contours.push(contour);
    }
  }

  _getSizeInBytes(): number {
    return this.contours.reduce((sizeInBytes, contour) => {
      return sizeInBytes + contour.sizeInBytes;
    }, 0);
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
  public getContours(): IContour[] {
    return this.contours;
  }

  public getSizeInBytes(): number {
    return this.sizeInBytes;
  }

  /**
   * It returns an array of all the points in the glyph
   * @returns An array of points.
   */
  public getFlatPointsArray(): Point3[] {
    return this.contours.map((contour) => contour.getPoints()).flat();
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
    return this.contours.reduce((numberOfPoints, contour) => {
      return numberOfPoints + contour.getPoints().length;
    }, 0);
  }

  /**
   * It returns an array of the number of points in each contour.
   * @returns An array of numbers.
   */
  public getNumberOfPointsArray(): number[] {
    return this.contours.reduce((acc, _, i) => {
      acc[i] = this.getNumberOfPointsInAContour(i);
      return acc;
    }, []);
  }

  /**
   * It returns the points in a contour.
   * @param contourIndex - The index of the contour you want to get the
   * points from.
   * @returns An array of Point3 objects.
   */
  public getPointsInContour(contourIndex: number): Point3[] {
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
    return this.getPointsInContour(contourIndex).length;
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
