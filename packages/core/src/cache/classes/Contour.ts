import type { Point3, ContourData } from '../../types';
import type { ContourType } from '../../enums';

interface ContourProps {
  id: string;
  data: ContourData;
  color: Point3;
  segmentIndex: number;
}

/**
 * Represents a contour in 3D space.
 *
 * @remarks
 * Each Contour is part of a ContourSet, and each ContourSet is part of a Geometry.
 * It holds information about the contour's id, size in bytes, points, color, and type.
 */
export class Contour {
  /** Unique identifier for the contour */
  readonly id: string;

  /** Size of the contour data in bytes */
  readonly sizeInBytes: number;

  /** Array of 3D points defining the contour */
  // Todo: we should use PointsManager: the efficiency of the contour access is
  // better because you can just get references to particular points, and the size
  // is just the native data type times the number of values total
  private _points: Point3[];

  /** Color of the contour */
  private _color: Point3;

  /** Type of the contour (closed or open) */
  private _type: ContourType;

  /** Index of the segment this contour belongs to */
  private _segmentIndex: number;

  /**
   * Creates an instance of Contour.
   *
   * @param props - The properties to initialize the Contour with
   */
  constructor(props: ContourProps) {
    const { points, type } = props.data;
    this.id = props.id;
    this._points = points;
    this._type = type;
    this._color = props.color;
    this._segmentIndex = props.segmentIndex;

    this.sizeInBytes = this._getSizeInBytes();
  }

  /**
   * Calculates the size of the contour in bytes.
   *
   * @returns The size of the contour in bytes
   * @private
   */
  private _getSizeInBytes(): number {
    // Assuming each point is 1 byte
    return this._points.length * 3;
  }

  /**
   * Gets the points of the contour.
   *
   * @returns The points of the contour
   */
  get points(): Point3[] {
    return this._points;
  }

  /**
   * Sets the points of the contour.
   *
   * @param value - The new points for the contour
   */
  set points(value: Point3[]) {
    this._points = value;
  }

  /**
   * Gets the color of the contour.
   *
   * @returns The color of the contour
   */
  get color(): Point3 {
    return this._color;
  }

  /**
   * Sets the color of the contour.
   *
   * @param value - The new color for the contour
   */
  set color(value: Point3) {
    this._color = value;
  }

  /**
   * Gets the type of the contour (closed or open).
   *
   * @returns The type of the contour
   */
  get type(): ContourType {
    return this._type;
  }

  /**
   * Sets the type of the contour.
   *
   * @param value - The new type for the contour
   */
  set type(value: ContourType) {
    this._type = value;
  }

  /**
   * Gets the segment index of the contour.
   *
   * @returns The segment index of the contour
   */
  get segmentIndex(): number {
    return this._segmentIndex;
  }

  /**
   * Sets the segment index of the contour.
   *
   * @param value - The new segment index for the contour
   */
  set segmentIndex(value: number) {
    this._segmentIndex = value;
  }

  /**
   * Gets a flat array of all points.
   *
   * @returns A flat array of all points
   */
  get flatPointsArray(): number[] {
    return this._points.map((point) => [...point]).flat();
  }
}

export default Contour;
