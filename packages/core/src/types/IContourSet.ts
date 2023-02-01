import { ContourData, IContour, Point3 } from './';

/**
 * This class represents a set of contours in 3d space.
 * Usually contours are grouped together in a contour set to represent a meaningful shape.
 */
export interface IContourSet {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  contours: IContour[];
  _createEachContour(data: ContourData[]): void;
  getSizeInBytes(): number;
  getColor(): any;
  /**
   * This function returns the contours of the image
   * @returns The contours of the image.
   */
  getContours(): IContour[];
  /**
   * It returns an array of all the points in the glyph
   * @returns An array of points.
   */
  getFlatPointsArray(): Point3[];
  /**
   * This function returns the number of contours in the current shape.
   * @returns The number of contours in the glyph.
   */
  getNumberOfContours(): number;
  /**
   * It loops through each contour in the `contours` array, and adds the number of
   * points in each contour to the `numberOfPoints` variable
   * @returns The number of points in the contours.
   */
  getTotalNumberOfPoints(): number;
  /**
   * It returns an array of the number of points in each contour.
   * @returns An array of numbers.
   */
  getNumberOfPointsArray(): number[];
  /**
   * It returns the points in a contour.
   * @param contourIndex - The index of the contour you want to get the
   * points from.
   * @returns An array of Point3 objects.
   */
  getPointsInContour(contourIndex: number): Point3[];
  /**
   * "This function returns the number of points in a contour."
   *
   * @param contourIndex - The index of the contour you want to get the
   * number of points from.
   * @returns The number of points in the contour.
   */
  getNumberOfPointsInAContour(contourIndex: number): number;
}
