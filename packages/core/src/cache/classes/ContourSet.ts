import type { Point3, IContour, ContourData } from '../../types';
import Contour from './Contour';

interface ContourSetProps {
  id: string;
  data: ContourData[];
  frameOfReferenceUID: string;
  segmentIndex: number;
  color?: Point3;
}

/**
 * Represents a set of contours in 3D space.
 * Usually contours are grouped together in a contour set to represent a meaningful shape.
 */
export class ContourSet {
  /** Unique identifier for the contour set */
  readonly id: string;

  /** Size of the contour set in bytes */
  readonly sizeInBytes: number;

  /** Frame of reference UID for the contour set */
  readonly frameOfReferenceUID: string;

  /** Color of the contour set */
  private _color: Point3 = [200, 0, 0]; // default color

  /** Index of the segment this contour set belongs to */
  private _segmentIndex: number;

  /** Centroid of the contour set */
  private _centroid: Point3;

  /** Array of contours in this set */
  private _contours: IContour[];

  /**
   * Creates an instance of ContourSet.
   * @param {ContourSetProps} props - The properties to initialize the ContourSet with
   */
  constructor(props: ContourSetProps) {
    this.id = props.id;
    this._contours = [];
    this._color = props.color ?? this._color;
    this.frameOfReferenceUID = props.frameOfReferenceUID;
    this._segmentIndex = props.segmentIndex;
    this._createEachContour(props.data);
    this.sizeInBytes = this._getSizeInBytes();
  }

  /**
   * Creates individual contours from the provided contour data array.
   * @param {ContourData[]} contourDataArray - Array of contour data to create contours from
   * @private
   */
  private _createEachContour(contourDataArray: ContourData[]): void {
    contourDataArray.forEach((contourData) => {
      const { points, type, color } = contourData;

      const contour = new Contour({
        id: `${this.id}-segment-${this._segmentIndex}`,
        data: {
          points,
          type,
          segmentIndex: this._segmentIndex,
          color: color ?? this._color,
        },
        segmentIndex: this._segmentIndex,
        color: color ?? this._color,
      });

      this._contours.push(contour);
    });

    this._updateContourSetCentroid();
  }

  /**
   * Updates the centroid of the contour set.
   * @private
   */
  private _updateContourSetCentroid(): void {
    const numberOfPoints = this.totalNumberOfPoints;
    const flatPointsArray = this.flatPointsArray;

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
    ] as Point3;

    const closestPoint = flatPointsArray.reduce((closestPoint, point) => {
      const distanceToPoint = this._getDistance(centroid, point);
      const distanceToClosestPoint = this._getDistance(centroid, closestPoint);

      if (distanceToPoint < distanceToClosestPoint) {
        return point;
      } else {
        return closestPoint;
      }
    }, flatPointsArray[0]);

    this._centroid = closestPoint;
  }

  /**
   * Calculates the total size of the contour set in bytes.
   * @returns {number} The size of the contour set in bytes
   * @private
   */
  private _getSizeInBytes(): number {
    return this._contours.reduce((sizeInBytes, contour) => {
      return sizeInBytes + contour.sizeInBytes;
    }, 0);
  }

  /**
   * Calculates the Euclidean distance between two 3D points.
   * @param {Point3} pointA - The first point
   * @param {Point3} pointB - The second point
   * @returns {number} The distance between the two points
   * @private
   */
  private _getDistance(pointA: Point3, pointB: Point3): number {
    return Math.sqrt(
      (pointA[0] - pointB[0]) ** 2 +
        (pointA[1] - pointB[1]) ** 2 +
        (pointA[2] - pointB[2]) ** 2
    );
  }

  /**
   * Gets the centroid of the contour set.
   * @returns {Point3} The centroid of the contour set
   */
  get centroid(): Point3 {
    return this._centroid;
  }

  /**
   * Gets the segment index of the contour set.
   * @returns {number} The segment index
   */
  get segmentIndex(): number {
    return this._segmentIndex;
  }

  /**
   * Gets the color of the contour set.
   * @returns {Point3} The color of the contour set
   */
  get color(): Point3 {
    return this._color;
  }

  /**
   * Sets the color of the contour set and updates all contours.
   * @param {Point3} value - The new color for the contour set
   */
  set color(value: Point3) {
    this._color = value;
    // Update color for all contours if needed
    this._contours.forEach((contour) => {
      if (contour instanceof Contour) {
        contour.color = value;
      }
    });
  }

  /**
   * Gets all contours in the set.
   * @returns {IContour[]} Array of contours
   */
  get contours(): IContour[] {
    return this._contours;
  }

  /**
   * Gets a flat array of all points from all contours.
   * @returns {Point3[]} Flat array of all points
   */
  get flatPointsArray(): Point3[] {
    return this._contours.flatMap((contour) => contour.points);
  }

  /**
   * Gets the number of contours in the set.
   * @returns {number} The number of contours
   */
  get numberOfContours(): number {
    return this._contours.length;
  }

  /**
   * Gets the total number of points across all contours.
   * @returns {number} The total number of points
   */
  get totalNumberOfPoints(): number {
    return this._contours.reduce((numberOfPoints, contour) => {
      return numberOfPoints + contour.points.length;
    }, 0);
  }

  /**
   * Gets an array of the number of points in each contour.
   * @returns {number[]} Array of point counts for each contour
   */
  get numberOfPointsArray(): number[] {
    return this._contours.map((contour) => contour.points.length);
  }

  /**
   * Gets the points of a specific contour.
   * @param {number} contourIndex - The index of the contour
   * @returns {Point3[]} Array of points for the specified contour
   */
  getPointsInContour(contourIndex: number): Point3[] {
    return this._contours[contourIndex].points;
  }

  /**
   * Gets the number of points in a specific contour.
   * @param {number} contourIndex - The index of the contour
   * @returns {number} The number of points in the specified contour
   */
  getNumberOfPointsInAContour(contourIndex: number): number {
    return this.getPointsInContour(contourIndex).length;
  }
}

export default ContourSet;
