import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import { Point3, IContourSet, IContour, ContourData } from '../../types';
import Contour from './Contour';

type ContourSetProps = {
  id: string;
  data: ContourData[];
  frameOfReferenceUID: string;
  segmentIndex: number;
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
  private segmentIndex: number;
  private polyData: vtkPolyData;
  private centroid: Point3;
  contours: IContour[];

  constructor(props: ContourSetProps) {
    this.id = props.id;
    this.contours = [];
    this.color = props.color ?? this.color;
    this.frameOfReferenceUID = props.frameOfReferenceUID;
    this.segmentIndex = props.segmentIndex;
    this._createEachContour(props.data);
    this.sizeInBytes = this._getSizeInBytes();
  }

  _createEachContour(contourDataArray: ContourData[]): void {
    contourDataArray.forEach((contourData) => {
      const { points, type, color } = contourData;

      const contour = new Contour({
        id: `${this.id}-segment-${this.segmentIndex}`,
        data: {
          points,
          type,
          segmentIndex: this.segmentIndex,
          color: color ?? this.color,
        },
        segmentIndex: this.segmentIndex,
        color: color ?? this.color,
      });

      this.contours.push(contour);
    });

    this._updateContourSetCentroid();
  }

  // Todo: this centroid calculation has limitation in which
  // it will not work for MPR, the reason is that we are finding
  // the centroid of all points but at the end we are picking the
  // closest point to the centroid, which will not work for MPR
  // The reason for picking the closest is a rendering issue since
  // the centroid can be not exactly in the middle of the slice
  // and it might cause the contour to be rendered in the wrong slice
  // or not rendered at all
  _updateContourSetCentroid(): void {
    const numberOfPoints = this.getTotalNumberOfPoints();
    const flatPointsArray = this.getFlatPointsArray();

    const sumOfPoints = flatPointsArray.reduce(
      (acc, point) => {
        return [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]];
      },
      [0, 0, 0]
    );

    const centroid = [
      sumOfPoints[0] / numberOfPoints,
      sumOfPoints[1] / numberOfPoints,
      sumOfPoints[2] / numberOfPoints,
    ];

    const closestPoint = flatPointsArray.reduce((closestPoint, point) => {
      const distanceToPoint = this._getDistance(centroid, point);
      const distanceToClosestPoint = this._getDistance(centroid, closestPoint);

      if (distanceToPoint < distanceToClosestPoint) {
        return point;
      } else {
        return closestPoint;
      }
    }, flatPointsArray[0]);

    this.centroid = closestPoint;
  }

  _getSizeInBytes(): number {
    return this.contours.reduce((sizeInBytes, contour) => {
      return sizeInBytes + contour.sizeInBytes;
    }, 0);
  }

  public getCentroid(): Point3 {
    return this.centroid;
  }

  public getSegmentIndex(): number {
    return this.segmentIndex;
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

  private _getDistance(pointA, pointB) {
    return Math.sqrt(
      (pointA[0] - pointB[0]) ** 2 +
        (pointA[1] - pointB[1]) ** 2 +
        (pointA[2] - pointB[2]) ** 2
    );
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
