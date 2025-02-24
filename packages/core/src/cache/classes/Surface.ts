import type { SurfaceData, Point3, RGB } from '../../types';

type SurfaceProps = SurfaceData;

/**
 * Surface class for storing surface data
 * Each Surface represents a single segment in a 3D volume.
 */
export class Surface {
  readonly id: string;
  readonly sizeInBytes: number;
  readonly frameOfReferenceUID: string;
  private _color: RGB = [200, 0, 0]; // default color
  private _points: number[];
  private _polys: number[];
  private _segmentIndex: number;
  private _centroid: Point3;
  private _visible: boolean;

  /**
   * Creates an instance of Surface.
   * @param {SurfaceProps} props - The properties to initialize the Surface with.
   */
  constructor(props: SurfaceProps) {
    this.id = props.id;
    this._points = props.points;
    this._polys = props.polys;
    this._color = props.color ?? this._color;
    this.frameOfReferenceUID = props.frameOfReferenceUID;
    this._segmentIndex = props.segmentIndex;
    this.sizeInBytes = this._getSizeInBytes();
    this._updateCentroid();
    this._visible = true;
  }

  /**
   * Calculates the size of the surface in bytes.
   * @returns {number} The size of the surface in bytes.
   * @private
   */
  private _getSizeInBytes(): number {
    return this._points.length * 4 + this._polys.length * 4;
  }

  /**
   * Updates the centroid of the surface.
   * @private
   */
  private _updateCentroid(): void {
    const numberOfPoints = this._points.length / 3;
    let sumX = 0,
      sumY = 0,
      sumZ = 0;

    for (let i = 0; i < this._points.length; i += 3) {
      sumX += this._points[i];
      sumY += this._points[i + 1];
      sumZ += this._points[i + 2];
    }

    this._centroid = [
      sumX / numberOfPoints,
      sumY / numberOfPoints,
      sumZ / numberOfPoints,
    ];
  }

  /**
   * Gets the color of the surface.
   * @returns {RGB} The color of the surface.
   */
  get color(): RGB {
    return this._color;
  }

  /**
   * Sets the color of the surface.
   * @param {RGB} color - The new color for the surface.
   */
  set color(color: RGB) {
    this._color = color;
  }

  /**
   * Gets the points of the surface.
   * @returns {number[]} The points of the surface.
   */
  get points(): number[] {
    return this._points;
  }

  /**
   * Sets the points of the surface and updates the centroid.
   * @param {number[]} points - The new points for the surface.
   */
  set points(points: number[]) {
    this._points = points;
    this._updateCentroid();
  }

  /**
   * Gets the polygons of the surface.
   * @returns {number[]} The polygons of the surface.
   */
  get polys(): number[] {
    return this._polys;
  }

  /**
   * Sets the polygons of the surface.
   * @param {number[]} polys - The new polygons for the surface.
   */
  set polys(polys: number[]) {
    this._polys = polys;
  }

  /**
   * Gets the segment index of the surface.
   * @returns {number} The segment index of the surface.
   */
  get segmentIndex(): number {
    return this._segmentIndex;
  }

  /**
   * Gets the visibility of the surface.
   */
  get visible(): boolean {
    return this._visible;
  }

  /**
   * Sets the visibility of the surface.
   * @param {boolean} visible - The new visibility for the surface.
   */
  set visible(visible: boolean) {
    this._visible = visible;
  }

  /**
   * Gets the centroid of the surface.
   * @returns {Point3} The centroid of the surface.
   */
  get centroid(): Point3 {
    return this._centroid;
  }

  /**
   * Gets a flat array of all points.
   * @returns {number[]} A flat array of all points.
   */
  get flatPointsArray(): number[] {
    return this._points;
  }

  /**
   * Gets the total number of points in the surface.
   * @returns {number} The total number of points.
   */
  get totalNumberOfPoints(): number {
    return this._points.length / 3;
  }
}
