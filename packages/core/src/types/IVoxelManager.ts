import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { PointInShape } from '../utilities/pointInShapeCallback';
import type BoundsIJK from './BoundsIJK';
import type { CPUImageData } from './CPUIImageData';
import type { IRLEVoxelMap } from './IRLEVoxelMap';
import type { PixelDataTypedArray } from './PixelDataTypedArray';
import type Point3 from './Point3';

/**
 * The options that `IVoxelManager.forEach` accepts.
 */
export type VoxelManagerForEachOptions = {
  boundsIJK?: BoundsIJK;
  isInObject?: (pointLPS, pointIJK) => boolean;
  returnPoints?: boolean;
  imageData?: vtkImageData | CPUImageData;
};

/**
 * The arguments that `IVoxelManager.forEach` gives to its callback.
 */
export type VoxelManagerForEachCallbackArguments = {
  value: unknown;
  index: number;
  pointIJK: Point3;
  pointLPS: Point3;
};

/**
 * A simple, standard interface to the values associated with a voxel.
 *
 * This interface is STRUCTURAL. `VoxelManager` implements it, and so can any
 * other object - a composite that holds several sub voxel managers, for
 * example. An earlier version of this file aliased the class
 * (`export type IVoxelManager<T> = VoxelManager<T>`), and an alias admits only
 * a subclass.
 *
 * FOUR MEMBERS ARE OPTIONAL, and they are optional for a reason. They are not
 * methods of the class. They are function-valued properties that a factory
 * installs on the instance after the constructor returns, and only some of the
 * factories install them:
 *
 * - `getCompleteScalarDataArray`
 * - `setCompleteScalarDataArray`
 * - `invalidateCache`
 * - `getRange`
 *
 * `VoxelManager.createScalarVolumeVoxelManager` and
 * `VoxelManager.createImageVoxelManager` install none of the four, so a call to
 * `getRange()` on one of those instances throws a `TypeError`.
 *
 * A caller that holds a VOLUME voxel manager does not need a guard. Use
 * {@link IVolumeVoxelManager} for that case, and see the note on that
 * interface.
 */
export interface IVoxelManager<T> {
  /** The identifier that the factory gave this voxel manager. */
  readonly id: string;
  /** The dimensions of the grid, as `[width, height, depth]`. */
  readonly dimensions: Point3;
  /** The number of components in each voxel. 1 for grayscale, 3 for RGB. */
  readonly numberOfComponents: number;
  /** `dimensions[0]`, kept as a field because the index arithmetic reads it. */
  width: number;
  /** `dimensions[0] * dimensions[1]`, the number of voxels in one frame. */
  frameSize: number;

  /**
   * The sparse store, for a voxel manager that a factory backed with a map or
   * with an RLE map. It is undefined for a voxel manager over a typed array.
   */
  map: Map<number, T> | IRLEVoxelMap<T>;
  /**
   * The voxel manager that this one writes through to, for a history voxel
   * manager or a preview voxel manager.
   */
  sourceVoxelManager: IVoxelManager<T>;
  /** The indices that a caller recorded with `addPoint`. */
  points: Set<number>;
  /** The k indices of the frames that a write changed. */
  modifiedSlices: Set<number>;
  /** The default test that `forEach` applies, when the options give no test. */
  isInObject: (pointLPS, pointIJK) => boolean;

  /**
   * Returns every voxel in one array. A factory installs this member, so a
   * caller that does not know which factory made this voxel manager must guard
   * the call. THE ARRAY IS READ ONLY: a write into the array does not reach the
   * voxels.
   */
  getCompleteScalarDataArray?: () => ArrayLike<number>;
  /** Writes every voxel from one array. A factory installs this member. */
  setCompleteScalarDataArray?: (scalarData: ArrayLike<number>) => void;
  /** Drops any cached lookup. A factory installs this member. */
  invalidateCache?: () => void;
  /** Gets the `[min, max]` pair of the data. A factory installs this member. */
  getRange?: () => [number, number];

  /** Gets the value at a flat index. The factory supplies this function. */
  readonly _get: (index: number) => T;
  /** Sets the value at a flat index. The factory supplies this function. */
  readonly _set: (index: number, v: T) => boolean;
  /** Gives the typed array constructor that the data expands to. */
  readonly _getConstructor?: () => new (length: number) => PixelDataTypedArray;
  /** Gives the length of the array that `getScalarData` produces. */
  _getScalarDataLength?: () => number;
  /** Produces the scalar data, for a voxel manager that stores no array. */
  _getScalarData?: () => ArrayLike<number>;
  /** Refreshes an array that a caller holds from the sparse store. */
  _updateScalarData?: (scalarData: ArrayLike<number>) => PixelDataTypedArray;
  /**
   * Produces the data of one slice. No factory installs this member today, and
   * no code reads it.
   */
  _getSliceData?: (args: {
    sliceIndex: number;
    slicePlane: number;
  }) => PixelDataTypedArray;

  /**
   * Gets the value at position i,j,k. Use this method, and not `getAtIJKPoint`,
   * where the performance matters.
   */
  getAtIJK: (i: number, j: number, k: number) => T;
  /**
   * Sets the value at position i,j,k, and records the frame that the write
   * changed. Use this method, and not `setAtIJKPoint`, where the performance
   * matters.
   */
  setAtIJK: (i: number, j: number, k: number, v) => boolean;
  /** Gets the value at an IJK point. */
  getAtIJKPoint: (point: Point3) => T;
  /** Sets the value at an IJK point, and records the frame. */
  setAtIJKPoint: (point: Point3, v) => void;
  /** Gets the value at a flat index. */
  getAtIndex: (index: number) => T;
  /** Sets the value at a flat index, and records the frame. */
  setAtIndex: (index: number, v) => boolean;

  /** Converts a flat index to an IJK point. */
  toIJK(index: number): Point3;
  /** Converts an IJK point to a flat index. */
  toIndex(ijk: Point3): number;

  /** The bounds of the whole grid. */
  getDefaultBounds(): BoundsIJK;
  /** The bounds of the voxels that a write changed, or the whole grid. */
  getBoundsIJK(): BoundsIJK;
  /** Replaces the recorded bounds. */
  setBounds(bounds: BoundsIJK): void;
  /** Resets the recorded bounds. */
  clearBounds(): void;

  /**
   * Applies a callback to the voxels of this voxel manager. The iteration
   * covers the bounds of the options, or the recorded bounds, or the whole
   * grid. A voxel manager over a map iterates over the stored values only.
   *
   * Both `direction` and `spacing` must reach this method through
   * `options.imageData` for the LPS calculation.
   *
   * The result holds the points only when `options.returnPoints` is true. The
   * RLE path gives no result at all, which is why `void` is part of the type.
   */
  forEach: (
    callback: (args: VoxelManagerForEachCallbackArguments) => void,
    options?: VoxelManagerForEachOptions
  ) => PointInShape[] | void;
  /**
   * The `forEach` of an RLE backed voxel manager. See the RLE map for the
   * callbacks that work at the level of a row or of a run, because those can be
   * faster.
   */
  rleForEach(callback, options?): void;

  /**
   * Gets the scalar data. `storeScalarData` keeps an expansion, so that the
   * next call returns the expansion and does not repeat the work.
   *
   * @throws Error - when no scalar data is available.
   */
  getScalarData(storeScalarData?: boolean): PixelDataTypedArray;
  /** Installs an array as the backing store of this voxel manager. */
  setScalarData(newScalarData: PixelDataTypedArray): void;
  /**
   * The backing store that a caller can write into, or undefined when this
   * voxel manager has none.
   */
  getWritableScalarData(): PixelDataTypedArray | undefined;
  /**
   * Copies an array INTO this voxel manager, in whatever representation this
   * voxel manager uses. Use this method, and not `getScalarData().set(...)`.
   */
  setFromScalarData(scalarData: ArrayLike<number>): void;
  /**
   * The length of the array that `getScalarData` produces.
   *
   * @throws Error - when the length can be neither measured nor derived.
   */
  getScalarDataLength(): number;
  /** The typed array constructor for the data. Defaults to `Float32Array`. */
  getConstructor(): new (length: number) => PixelDataTypedArray;
  /** The size of the data in bytes. */
  readonly sizeInBytes: number;
  /** The number of bytes in one voxel. */
  readonly bytePerVoxel: number;

  /** Gets the data of one slice, on one of the three axis aligned planes. */
  getSliceData: (args: {
    sliceIndex: number;
    slicePlane: number;
  }) => PixelDataTypedArray;
  /** Gets the data of the middle slice on the k axis. */
  getMiddleSliceData: () => PixelDataTypedArray;
  /** The k indices of the frames that a write changed. */
  getArrayOfModifiedSlices(): number[];
  /** Marks every frame as unchanged. */
  resetModifiedSlices(): void;

  /** Records a point, for example a point that the user clicked. */
  addPoint(point: Point3 | number): void;
  /** The recorded points, as IJK points. */
  getPoints(): Point3[];

  /**
   * The min and max of the data.
   *
   * A grayscale voxel manager gives a number for each of the two values, and an
   * RGB voxel manager gives an array of three numbers, so the type of each
   * value is `T`. A caller over a union of the two must test the result.
   */
  getMinMax(): { min: T; max: T };
  /** Clears the sparse store, the recorded frames, the points and the bounds. */
  clear(): void;
}

/**
 * A voxel manager over a whole volume, which a factory built with all four of
 * the function-valued properties installed.
 *
 * WHY THIS SECOND INTERFACE EXISTS. A survey found about 39 call sites of the
 * four properties that apply no guard, and about 30 of those call sites call
 * `getCompleteScalarDataArray`. Every one of the 39 sites holds a volume voxel
 * manager - a labelmap, a segmentation, a sub-volume or a reference volume -
 * and `VoxelManager.createImageVolumeVoxelManager` installs all four
 * properties. The calls are therefore safe for a structural reason, and this
 * interface states that reason in the type system.
 *
 * NOTE ON THE DYNAMIC VOLUME. `VoxelManager.createScalarDynamicVolumeVoxelManager`
 * installs `getRange` and `getCompleteScalarDataArray`, and it installs neither
 * `setCompleteScalarDataArray` nor `invalidateCache`. That factory therefore
 * returns an `IVoxelManager` and not an `IVolumeVoxelManager`.
 *
 * NOTE ON THE COMPILER. `tsconfig.base.json` sets `strictNullChecks` to false,
 * so the compiler lets a caller call an optional property of `IVoxelManager`
 * with no guard. This interface therefore records the structural reason for the
 * reader, and it enforces nothing today. It starts to enforce the reason on the
 * day that somebody turns `strictNullChecks` on.
 */
export interface IVolumeVoxelManager<T> extends IVoxelManager<T> {
  getCompleteScalarDataArray: () => ArrayLike<number>;
  setCompleteScalarDataArray: (scalarData: ArrayLike<number>) => void;
  invalidateCache: () => void;
  getRange: () => [number, number];
}
