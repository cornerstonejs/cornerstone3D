import { vec3 } from 'gl-matrix';
import cache from '../cache/cache';
import type {
  BoundsIJK,
  Point3,
  PixelDataTypedArray,
  IImage,
  RGB,
  CPUImageData,
  IVoxelManager,
  IRLEVoxelMap,
  Point2,
} from '../types';
import RLEVoxelMap from './RLEVoxelMap';
import isEqual from './isEqual';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { iterateOverPointsInShapeVoxelManager } from './pointInShapeCallback';

/**
 * Have a default size for cached RLE encoded images.  This is hard to guess
 * up front because the RLE is usually used to store new/updated data, but this
 * is a first guess.
 */
const DEFAULT_RLE_SIZE = 5 * 1024;

/**
 * This is a simple, standard interface to values associated with a voxel.
 */
export default class VoxelManager<T> {
  public modifiedSlices = new Set<number>();
  private boundsIJK = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as BoundsIJK;

  public map: Map<number, T> | IRLEVoxelMap<T>;
  public sourceVoxelManager: IVoxelManager<T>;
  public isInObject: (pointLPS, pointIJK) => boolean;
  public readonly dimensions: Point3;
  public readonly numberOfComponents;
  public getCompleteScalarDataArray?: () => ArrayLike<number>;
  public setCompleteScalarDataArray?: (scalarData: ArrayLike<number>) => void;

  public getRange: () => [number, number];
  private scalarData = null as PixelDataTypedArray;
  // caching for sliceData as it is expensive to get it from the cache
  // I think we need to have a way to invalidate this cache and also have
  // a limit on the number of slices to cache since it can grow indefinitely
  private _sliceDataCache = null as Map<string, PixelDataTypedArray>;

  public readonly _id: string;

  points: Set<number>;
  width: number;
  frameSize: number;
  readonly _get: (index: number) => T;
  readonly _set: (index: number, v: T) => boolean;
  readonly _getConstructor?: () => new (length: number) => PixelDataTypedArray;
  _getScalarDataLength?: () => number;
  _getScalarData?: () => ArrayLike<number>;
  _updateScalarData?: (scalarData: ArrayLike<number>) => PixelDataTypedArray;
  _getSliceData: (args: {
    sliceIndex: number;
    slicePlane: number;
  }) => PixelDataTypedArray;

  /**
   * Creates a generic voxel value accessor, with access to the values
   * provided by the _get and optionally _set values.
   * @param dimensions - for the voxel volume
   * @param options._get - called to get a value by index
   * @param options._set  - called when setting a value
   */
  constructor(
    dimensions,
    options: {
      _get: (index: number) => T;
      _set?: (index: number, v: T) => boolean;
      _getScalarData?: () => ArrayLike<number>;
      _id?: string;
      _updateScalarData?: (
        scalarData: ArrayLike<number>
      ) => PixelDataTypedArray;
      numberOfComponents?: number;
      scalarData?: ArrayLike<number>;
      _getConstructor?: () => new (length: number) => PixelDataTypedArray;
    }
  ) {
    this.dimensions = dimensions;
    this.width = dimensions[0];
    this.frameSize = this.width * dimensions[1];
    this._get = options._get;
    this._set = options._set;
    this._id = options._id || '';
    this._getConstructor = options._getConstructor;
    this.numberOfComponents = this.numberOfComponents || 1;
    this.scalarData = options.scalarData as PixelDataTypedArray;
    this._getScalarData = options._getScalarData;
    this._updateScalarData = options._updateScalarData;
  }

  /**
   * Gets the voxel value at position i,j,k.
   * This method should be used in favor of getAtIJKPoint when performance is a concern.
   */
  public getAtIJK = (i, j, k) => {
    const index = this.toIndex([i, j, k]);
    return this._get(index);
  };

  /**
   * Sets the voxel value at position i,j,k and records the slice
   * that was modified.
   *
   * This method should be used in favor of setAtIJKPoint when performance is a concern.
   */
  public setAtIJK = (i: number, j: number, k: number, v) => {
    const index = this.toIndex([i, j, k]);
    const changed = this._set(index, v);
    if (changed !== false) {
      this.modifiedSlices.add(k);
      VoxelManager.addBounds(this.boundsIJK, [i, j, k]);
    }

    return changed;
  };

  /**
   * Gets the voxel value at the given Point3 location.
   */
  public getAtIJKPoint = ([i, j, k]) => this.getAtIJK(i, j, k);

  /**
   * Sets the voxel value at the given point3 location to the specified value.
   * Records the z index modified.
   * Will record the index value if the VoxelManager is backed by a map.
   */
  public setAtIJKPoint = ([i, j, k]: Point3, v) => {
    this.setAtIJK(i, j, k, v);
  };

  /**
   * Gets the value at the given index.
   */
  public getAtIndex = (index) => this._get(index);

  /** Gets the min/max pair - as array for RGB */
  public getMinMax() {
    let min, max;
    const callback = ({ value: v }) => {
      const isArray = Array.isArray(v);
      if (min === undefined) {
        min = isArray ? [...v] : v;
        max = isArray ? [...v] : v;
      }
      if (isArray) {
        for (let i = 0; i < v.length; i++) {
          min[i] = Math.min(min[i], v[i]);
          max[i] = Math.max(max[i], v[i]);
        }
      } else {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    };
    this.forEach(callback, { boundsIJK: this.getDefaultBounds() });
    return { min, max };
  }

  /**
   * Sets the value at the given index
   */
  public setAtIndex = (index, v) => {
    const changed = this._set(index, v);
    if (changed !== false) {
      const pointIJK = this.toIJK(index);
      this.modifiedSlices.add(pointIJK[2]);
      VoxelManager.addBounds(this.boundsIJK, pointIJK);
    }
    return changed;
  };

  /**
   * Converts an index value to a Point3 IJK value
   */
  public toIJK(index: number): Point3 {
    return [
      index % this.width,
      Math.floor((index % this.frameSize) / this.width),
      Math.floor(index / this.frameSize),
    ];
  }

  public getMiddleSliceData = () => {
    const middleSliceIndex = Math.floor(this.dimensions[2] / 2);
    return this.getSliceData({
      sliceIndex: middleSliceIndex,
      slicePlane: 2,
    });
  };

  /**
   * Converts an IJK Point3 value to an index value
   */
  public toIndex(ijk: Point3) {
    return ijk[0] + ijk[1] * this.width + ijk[2] * this.frameSize;
  }

  public getDefaultBounds() {
    return this.dimensions.map((dimension) => [0, dimension - 1]) as BoundsIJK;
  }

  /**
   * Gets the bounds for the modified set of values.
   */
  public getBoundsIJK(): BoundsIJK {
    if (this.boundsIJK[0][0] < this.dimensions[0]) {
      return this.boundsIJK;
    }
    return this.getDefaultBounds();
  }

  /**
   * Iterates over the voxels in the VoxelManager and applies a callback function to each voxel.
   * It can operate on IJK and LPS coordinate systems, and it can be limited to a specific region
   * of the data if the isInObject function is provided.
   *
   * For the LPS calculations, both direction and spacing should be provided.
   *
   * If the boundsIJK is not provided, the iteration will be over the entire volume/data
   *
   *
   * If the VoxelManager is backed by a Map, it will only iterate over the stored values.
   * Otherwise, it will iterate over all voxels within the specified or default bounds.
   */
  public forEach = (
    callback: (args: {
      value: unknown;
      index: number;
      pointIJK: Point3;
      pointLPS: Point3;
    }) => void,
    options: {
      boundsIJK?: BoundsIJK;
      isInObject?: (pointLPS, pointIJK) => boolean;
      returnPoints?: boolean;
      imageData?: vtkImageData | CPUImageData;
    } = {}
  ) => {
    const isInObjectBoundsIJK = options.boundsIJK || this.getBoundsIJK();
    const isInObject = options.isInObject || this.isInObject || (() => true);
    const returnPoints = options.returnPoints || false;

    const useLPSTransform = options.imageData;

    const iMin = Math.min(isInObjectBoundsIJK[0][0], isInObjectBoundsIJK[0][1]);
    const iMax = Math.max(isInObjectBoundsIJK[0][0], isInObjectBoundsIJK[0][1]);
    const jMin = Math.min(isInObjectBoundsIJK[1][0], isInObjectBoundsIJK[1][1]);
    const jMax = Math.max(isInObjectBoundsIJK[1][0], isInObjectBoundsIJK[1][1]);
    const kMin = Math.min(isInObjectBoundsIJK[2][0], isInObjectBoundsIJK[2][1]);
    const kMax = Math.max(isInObjectBoundsIJK[2][0], isInObjectBoundsIJK[2][1]);

    const pointsInShape = [];

    if (useLPSTransform) {
      const pointsInShape = iterateOverPointsInShapeVoxelManager({
        voxelManager: this,
        imageData: options.imageData,
        bounds: [
          [iMin, iMax],
          [jMin, jMax],
          [kMin, kMax],
        ],
        pointInShapeFn: isInObject,
        callback,
      });
      return pointsInShape;
    }

    // We don't need the complex LPS calculations and we can just iterate over the data
    // in the IJK coordinate system
    if (this.map) {
      if (this.map instanceof RLEVoxelMap) {
        return this.rleForEach(callback, options);
      }
      // Optimize this for only values in the map
      for (const index of this.map.keys()) {
        const pointIJK = this.toIJK(index);
        if (!isInObject(null, pointIJK)) {
          continue;
        }
        const value = this._get(index);

        if (returnPoints) {
          pointsInShape.push({
            value,
            index,
            pointIJK,
            pointLPS: null,
          });
        }

        callback({ value, index, pointIJK, pointLPS: null });
      }

      return pointsInShape;
    } else {
      for (let k = kMin; k <= kMax; k++) {
        const kIndex = k * this.frameSize;
        for (let j = jMin; j <= jMax; j++) {
          const jIndex = kIndex + j * this.width;
          for (let i = iMin, index = jIndex + i; i <= iMax; i++, index++) {
            const value = this.getAtIndex(index);
            const pointIJK = [i, j, k];

            if (!isInObject(null, pointIJK)) {
              continue;
            }

            if (returnPoints) {
              pointsInShape.push({
                value,
                index,
                pointIJK,
                pointLPS: null,
              });
            }
            callback({ value, index, pointIJK: [i, j, k], pointLPS: null });
          }
        }
      }

      return pointsInShape;
    }
  };

  /**
   * Foreach callback optimized for RLE testing
   */
  public rleForEach(callback, options?) {
    const boundsIJK = options?.boundsIJK || this.getBoundsIJK();
    const { isWithinObject } = options || {};
    const map = this.map as RLEVoxelMap<T>;
    map.defaultValue = undefined;
    for (let k = boundsIJK[2][0]; k <= boundsIJK[2][1]; k++) {
      for (let j = boundsIJK[1][0]; j <= boundsIJK[1][1]; j++) {
        const row = map.getRun(j, k);
        if (!row) {
          continue;
        }
        for (const rle of row) {
          const { start, end, value } = rle;
          const baseIndex = this.toIndex([0, j, k]);
          for (let i = start; i < end; i++) {
            const callbackArguments = {
              value,
              index: baseIndex + i,
              pointIJK: [i, j, k],
            };
            if (isWithinObject?.(callbackArguments) === false) {
              continue;
            }
            callback(callbackArguments);
          }
        }
      }
    }
  }

  /**
   * Retrieves the scalar data.
   * If the scalar data is already available, it will be returned.
   * Otherwise, if the `_getScalarData` method is defined, it will be called to retrieve the scalar data.
   * If neither the scalar data nor the `_getScalarData` method is available, an error will be thrown.
   *
   * @param storeScalarData - a parameter to allow storing the scalar data rather than throwing it away
   *     each time.
   * @returns The scalar data.
   * @throws {Error} If no scalar data is available.
   */
  public getScalarData(storeScalarData = false): PixelDataTypedArray {
    if (this.scalarData) {
      this._updateScalarData?.(this.scalarData);
      return this.scalarData;
    }

    if (this._getScalarData) {
      const scalarData = this._getScalarData();
      if (storeScalarData) {
        console.log('Not transient, should store value', scalarData);
      }
      return scalarData as PixelDataTypedArray;
    }

    throw new Error('No scalar data available');
  }

  public setScalarData(newScalarData: PixelDataTypedArray) {
    this.scalarData = newScalarData;
  }

  /**
   * Gets the length of the scalar data.
   *
   * @returns The length of the scalar data.
   * @throws {Error} If no scalar data is available.
   */
  public getScalarDataLength() {
    if (this.scalarData) {
      return this.scalarData.length;
    }

    if (this._getScalarDataLength) {
      return this._getScalarDataLength();
    }

    throw new Error('No scalar data available');
  }

  public get sizeInBytes(): number {
    return this.getScalarDataLength() * this.bytePerVoxel;
  }

  public get bytePerVoxel(): number {
    if (this.scalarData) {
      return this.scalarData.BYTES_PER_ELEMENT;
    }

    // get the first element of the scalar data
    const value = this._get(0) as unknown as { BYTES_PER_ELEMENT: number };
    return value.BYTES_PER_ELEMENT;
  }

  /**
   * Clears any map specific data, as well as the modified slices, points and
   * bounds.
   */
  public clear() {
    if (this.map) {
      this.map.clear();
    }
    this.boundsIJK.map((bound) => {
      bound[0] = Infinity;
      bound[1] = -Infinity;
    });
    this.modifiedSlices.clear();
    this.points?.clear();
  }

  /**
   * @returns a constructor for a typed array for the pixel data of the given length
   *     and the right type.  Defaults to float32array.
   */
  public getConstructor(): new (length: number) => PixelDataTypedArray {
    if (this.scalarData) {
      return this.scalarData.constructor as new (
        length: number
      ) => PixelDataTypedArray;
    }

    if (this._getConstructor) {
      return this._getConstructor() as new (
        length: number
      ) => PixelDataTypedArray;
    }

    console.warn(
      'No scalar data available or can be used to get the constructor'
    );

    // Return a default constructor (e.g., Float32Array) if no constructor is available
    return Float32Array as new (length: number) => PixelDataTypedArray;
  }

  /**
   * @returns The array of modified k indices
   */
  public getArrayOfModifiedSlices(): number[] {
    return Array.from(this.modifiedSlices);
  }

  /**
   * Resets the set of modified slices.
   * This method clears all entries from the `modifiedSlices` set,
   * effectively marking all slices as unmodified.
   */
  public resetModifiedSlices(): void {
    this.modifiedSlices.clear();
  }

  /**
   * Extends the bounds of this object to include the specified point
   */
  public static addBounds(bounds: BoundsIJK, point: Point3) {
    if (!bounds) {
      bounds = [
        [Infinity, -Infinity],
        [Infinity, -Infinity],
        [Infinity, -Infinity],
      ];
    }

    // Directly update the bounds for each axis
    bounds[0][0] = Math.min(point[0], bounds[0][0]);
    bounds[0][1] = Math.max(point[0], bounds[0][1]);
    bounds[1][0] = Math.min(point[1], bounds[1][0]);
    bounds[1][1] = Math.max(point[1], bounds[1][1]);
    bounds[2][0] = Math.min(point[2], bounds[2][0]);
    bounds[2][1] = Math.max(point[2], bounds[2][1]);
  }

  /**
   * Adds a point as an array or an index value to the set of points
   * associated with this voxel value.
   * Can be used for tracking clicked points or other modified values.
   */
  public addPoint(point: Point3 | number) {
    const index = Array.isArray(point)
      ? point[0] + this.width * point[1] + this.frameSize * point[2]
      : point;
    if (!this.points) {
      this.points = new Set<number>();
    }
    this.points.add(index);
  }

  /**
   * Gets the list of added points as an array of Point3 values
   */
  public getPoints(): Point3[] {
    return this.points
      ? [...this.points].map((index) => this.toIJK(index))
      : [];
  }

  /**
   * Retrieves the slice data for a given slice view.
   *
   * @param sliceViewInfo - An object containing information about the slice view.
   * @param sliceViewInfo.sliceIndex - The index of the slice.
   * @param sliceViewInfo.slicePlane - The axis of the slice (0 for YZ plane, 1 for XZ plane, 2 for XY plane).
   * @returns A typed array containing the pixel data for the specified slice.
   * @throws Error if an invalid slice axis is provided.
   */
  public getSliceData = ({
    sliceIndex,
    slicePlane,
  }: {
    sliceIndex: number;
    slicePlane: number;
  }): PixelDataTypedArray => {
    const [width, height, depth] = this.dimensions;
    const frameSize = width * height;
    const startIndex = sliceIndex * frameSize;

    let sliceSize: number;
    const SliceDataConstructor = this.getConstructor();

    function isValidConstructor(
      ctor: unknown
    ): ctor is new (length: number) => PixelDataTypedArray {
      return typeof ctor === 'function';
    }

    if (!isValidConstructor(SliceDataConstructor)) {
      // Return an empty typed array instead of an empty regular array
      return new Uint8Array(0) as PixelDataTypedArray;
    }

    // Todo: optimize it when we have scalar data
    let sliceData: PixelDataTypedArray;
    switch (slicePlane) {
      case 0: // YZ plane
        sliceSize = height * depth;
        sliceData = new SliceDataConstructor(sliceSize);
        for (let i = 0; i < height; i++) {
          for (let j = 0; j < depth; j++) {
            const index = sliceIndex + i * width + j * frameSize;
            this.setSliceDataValue(sliceData, i * depth + j, this._get(index));
          }
        }
        break;
      case 1: // XZ plane
        sliceSize = width * depth;
        sliceData = new SliceDataConstructor(sliceSize);
        for (let i = 0; i < width; i++) {
          for (let j = 0; j < depth; j++) {
            const index = i + sliceIndex * width + j * frameSize;
            this.setSliceDataValue(sliceData, i + j * width, this._get(index));
          }
        }
        break;
      case 2: // XY plane
        sliceSize = width * height;
        sliceData = new SliceDataConstructor(sliceSize);
        for (let i = 0; i < sliceSize; i++) {
          this.setSliceDataValue(sliceData, i, this._get(startIndex + i));
        }
        break;
      default:
        throw new Error(
          'Oblique plane - todo - implement as ortho normal vector'
        );
    }

    return sliceData;
  };

  private setSliceDataValue(
    sliceData: PixelDataTypedArray,
    index: number,
    value: T
  ): void {
    if (Array.isArray(value)) {
      // Handle RGB values
      for (let i = 0; i < value.length; i++) {
        sliceData[index * value.length + i] = this.toNumber(value[i]);
      }
    } else {
      // Handle single number values
      sliceData[index] = this.toNumber(value);
    }
  }

  private toNumber(value: T | number): number {
    if (typeof value === 'number') {
      return value;
    }
    if (Array.isArray(value)) {
      return value[0] || 0;
    }
    return 0;
  }

  /**
   * Creates a voxel manager backed by an array of scalar data having the
   * given number of components.
   * Note that the number of components can be larger than three, in case data
   * is stored in additional pixels.  However, the return type is still RGB.
   */
  private static _createRGBScalarVolumeVoxelManager({
    dimensions,
    scalarData,
    numberOfComponents = 3,
  }: {
    dimensions: Point3;
    scalarData;
    numberOfComponents;
  }): VoxelManager<RGB> {
    const voxels = new VoxelManager<RGB>(dimensions, {
      _get: (index) => {
        index *= numberOfComponents;
        return [
          scalarData[index++],
          scalarData[index++],
          scalarData[index++],
        ] as RGB;
      },
      _id: '_createRGBScalarVolumeVoxelManager',
      _set: (index, v) => {
        index *= 3;
        const isChanged = !isEqual(scalarData[index], v);
        scalarData[index++] = v[0];
        scalarData[index++] = v[1];
        scalarData[index++] = v[2];
        return isChanged;
      },
      numberOfComponents,
      scalarData,
    });

    voxels.clear = () => {
      scalarData.fill(0);
    };
    return voxels;
  }

  /**
   * Creates a VoxelManager for an image volume. which are those volumes
   * that are composed of multiple images, one for each slice.
   * @param dimensions - The dimensions of the image volume.
   * @param imageIds - The array of image IDs.
   * @returns A VoxelManager instance for the image volume.
   */
  public static createImageVolumeVoxelManager({
    dimensions,
    imageIds,
    numberOfComponents = 1,
  }: {
    dimensions: Point3;
    imageIds: string[];
    numberOfComponents: number;
  }): IVoxelManager<number> | IVoxelManager<RGB> {
    const pixelsPerSlice = dimensions[0] * dimensions[1];

    function getPixelInfo(index) {
      const sliceIndex = Math.floor(index / pixelsPerSlice);
      if (sliceIndex < 0 || sliceIndex >= dimensions[2]) {
        return {};
      }
      const imageId = imageIds[sliceIndex];

      if (!imageId) {
        console.warn(`ImageId not found for sliceIndex: ${sliceIndex}`);
        return { pixelData: null, pixelIndex: null };
      }

      const image = cache.getImage(imageId);

      if (!image) {
        console.warn(`Image not found for imageId: ${imageId}`);
        return { pixelData: null, pixelIndex: null };
      }

      const voxelManager = image.voxelManager;
      const pixelIndex = index % pixelsPerSlice;

      return { voxelManager, pixelIndex };
    }

    function getVoxelValue(index) {
      const { voxelManager: imageVoxelManager, pixelIndex } =
        getPixelInfo(index);

      if (!imageVoxelManager || pixelIndex === null) {
        return null;
      }

      return imageVoxelManager.getAtIndex(pixelIndex) as number | RGB;
    }

    function setVoxelValue(index, v) {
      const { voxelManager: imageVoxelManager, pixelIndex } =
        getPixelInfo(index);

      if (!imageVoxelManager || pixelIndex === null) {
        return false;
      }

      const currentValue = imageVoxelManager.getAtIndex(pixelIndex);
      const isChanged = !isEqual(v, currentValue);

      if (!isChanged) {
        return isChanged;
      }
      imageVoxelManager.setAtIndex(pixelIndex, v as number);

      return true;
    }

    const _getConstructor = () => {
      const { voxelManager: imageVoxelManager } = getPixelInfo(0);
      if (!imageVoxelManager) {
        return null;
      }
      return imageVoxelManager.getConstructor();
    };

    const voxelManager = new VoxelManager<number | RGB>(dimensions, {
      _get: getVoxelValue,
      _set: setVoxelValue,
      numberOfComponents,
      _getConstructor,
      _id: 'createImageVolumeVoxelManager',
    });

    voxelManager.getMiddleSliceData = () => {
      const middleSliceIndex = Math.floor(dimensions[2] / 2);
      return voxelManager.getSliceData({
        sliceIndex: middleSliceIndex,
        slicePlane: 2,
      });
    };

    voxelManager.clear = () => {
      for (const imageId of imageIds) {
        const image = cache.getImage(imageId);
        image.voxelManager.clear();
      }
    };

    // Todo: need a way to make it understand dirty status if pixel data is changed
    voxelManager.getRange = () => {
      // get all the pixel data
      let minValue = Infinity;
      let maxValue = -Infinity;
      for (const imageId of imageIds) {
        const image = cache.getImage(imageId);

        // min and max pixel value is correct, //todo this is not true
        // for dynamically changing data such as labelmaps in segmentation
        if (image.minPixelValue < minValue) {
          minValue = image.minPixelValue;
        }
        if (image.maxPixelValue > maxValue) {
          maxValue = image.maxPixelValue;
        }
      }
      return [minValue, maxValue];
    };

    voxelManager._getScalarDataLength = () => {
      const { voxelManager: imageVoxelManager } = getPixelInfo(0);
      if (!imageVoxelManager) {
        return 0;
      }
      return imageVoxelManager.getScalarDataLength() * dimensions[2];
    };

    /**
     * Retrieves the scalar data in a memory-inefficient manner.
     * Useful for debugging, testing, or methods requiring all scalar data at once.
     *
     * IMPORTANT: This is READ ONLY. Changes to the returned buffer are never
     * reflected in the underlying data unless individually merged back.
     *
     * @returns {ArrayLike<number>} The scalar data array (read-only)
     */
    voxelManager.getCompleteScalarDataArray = () => {
      const ScalarDataConstructor = voxelManager._getConstructor();
      if (!ScalarDataConstructor) {
        return new Uint8Array(0);
      }

      const dataLength = voxelManager.getScalarDataLength();
      // @ts-ignore
      const scalarData = new ScalarDataConstructor(dataLength);

      const sliceSize = dimensions[0] * dimensions[1] * numberOfComponents;

      for (let sliceIndex = 0; sliceIndex < dimensions[2]; sliceIndex++) {
        const { voxelManager: imageVoxelManager } = getPixelInfo(
          (sliceIndex * sliceSize) / numberOfComponents
        );

        if (imageVoxelManager) {
          const sliceStart = sliceIndex * sliceSize;
          const pixelData = imageVoxelManager.getScalarData();

          if (numberOfComponents === 1) {
            scalarData.set(pixelData, sliceStart);
          } else {
            // For RGB(A) data, we need to ensure correct component ordering
            for (let i = 0; i < pixelData.length; i += numberOfComponents) {
              for (let j = 0; j < numberOfComponents; j++) {
                scalarData[sliceStart + i + j] = pixelData[i + j];
              }
            }
          }
        }
      }

      return scalarData;
    };

    voxelManager.setCompleteScalarDataArray = (scalarData) => {
      const sliceSize = dimensions[0] * dimensions[1] * numberOfComponents;
      const SliceDataConstructor = voxelManager._getConstructor();

      // Track min/max values across all slices
      let minValue = Infinity;
      let maxValue = -Infinity;

      for (let sliceIndex = 0; sliceIndex < dimensions[2]; sliceIndex++) {
        const { voxelManager: imageVoxelManager } = getPixelInfo(
          (sliceIndex * sliceSize) / numberOfComponents
        );

        if (imageVoxelManager && SliceDataConstructor) {
          const sliceStart = sliceIndex * sliceSize;
          const sliceEnd = sliceStart + sliceSize;
          // @ts-ignore
          const sliceData = new SliceDataConstructor(sliceSize);
          // @ts-ignore
          sliceData.set(scalarData.subarray(sliceStart, sliceEnd));
          imageVoxelManager.scalarData = sliceData;

          // Update min/max values for this slice
          for (let i = 0; i < sliceData.length; i++) {
            const value = sliceData[i];
            minValue = Math.min(minValue, value);
            maxValue = Math.max(maxValue, value);
          }

          // Update the image's min/max pixel values
          const imageId = imageIds[sliceIndex];
          const image = cache.getImage(imageId);
          if (image) {
            image.minPixelValue = minValue;
            image.maxPixelValue = maxValue;
          }
        }
      }

      // Mark all slices as modified
      for (let k = 0; k < dimensions[2]; k++) {
        voxelManager.modifiedSlices.add(k);
      }

      // Update bounds
      voxelManager.boundsIJK = [
        [0, dimensions[0] - 1],
        [0, dimensions[1] - 1],
        [0, dimensions[2] - 1],
      ];
    };

    return voxelManager as IVoxelManager<number> | IVoxelManager<RGB>;
  }

  /**
   *  Creates a volume value accessor, based on a volume scalar data instance.
   * This also works for image value accessors for single plane (k=0) accessors.
   *
   * This should be deprecated in favor of the createImageVolumeVoxelManager
   * method since that one does not need to know the number of scalar data and
   * it creates them on the fly.
   */
  public static createScalarVolumeVoxelManager({
    dimensions,
    scalarData,
    numberOfComponents = 1,
  }: {
    dimensions: Point3;
    scalarData;
    numberOfComponents?: number;
  }): IVoxelManager<number> | IVoxelManager<RGB> {
    if (dimensions.length !== 3) {
      throw new Error(
        'Dimensions must be provided as [number, number, number] for [width, height, depth]'
      );
    }

    if (!numberOfComponents) {
      numberOfComponents =
        scalarData.length / dimensions[0] / dimensions[1] / dimensions[2];
      // We only support 1,3,4 component data, and sometimes the scalar data
      // doesn't match for some reason, so throw an exception
      if (
        numberOfComponents > 4 ||
        numberOfComponents < 1 ||
        numberOfComponents === 2
      ) {
        throw new Error(
          `Number of components ${numberOfComponents} must be 1, 3 or 4`
        );
      }
    }
    if (numberOfComponents > 1) {
      return VoxelManager._createRGBScalarVolumeVoxelManager({
        dimensions,
        scalarData,
        numberOfComponents,
      });
    }
    return VoxelManager._createNumberVolumeVoxelManager({
      dimensions,
      scalarData,
    });
  }

  public static createScalarDynamicVolumeVoxelManager({
    imageIdGroups,
    dimensions,
    timePoint = 0,
    numberOfComponents = 1,
  }: {
    imageIdGroups: string[][];
    dimensions: Point3;
    timePoint: number;
    numberOfComponents?: number;
  }): IVoxelManager<number> | IVoxelManager<RGB> {
    if (!numberOfComponents) {
      const firstImage = cache.getImage(imageIdGroups[0][0]);
      if (!firstImage) {
        throw new Error(
          'Unable to determine number of components: No image found'
        );
      }
      numberOfComponents =
        firstImage.getPixelData().length / (dimensions[0] * dimensions[1]);
      if (
        numberOfComponents > 4 ||
        numberOfComponents < 1 ||
        numberOfComponents === 2
      ) {
        throw new Error(
          `Number of components ${numberOfComponents} must be 1, 3 or 4`
        );
      }
    }

    const voxelGroups = imageIdGroups.map((imageIds) => {
      return VoxelManager.createImageVolumeVoxelManager({
        dimensions,
        imageIds,
        numberOfComponents,
      });
    });

    // Create a VoxelManager that will manage the active voxel group
    const voxelManager = new VoxelManager<number | RGB>(dimensions, {
      _get: (index) => voxelGroups[timePoint]._get(index),
      // @ts-ignore
      _set: (index, v) => voxelGroups[timePoint]._set(index, v),
      numberOfComponents,
      _id: 'createScalarDynamicVolumeVoxelManager',
    }) as IVoxelManager<number> | IVoxelManager<RGB>;

    voxelManager.getScalarDataLength = () => {
      return voxelGroups[timePoint].getScalarDataLength();
    };

    voxelManager.getConstructor = () => {
      return voxelGroups[timePoint].getConstructor();
    };

    voxelManager.getRange = () => {
      return voxelGroups[timePoint].getRange();
    };

    voxelManager.getMiddleSliceData = () => {
      return voxelGroups[timePoint].getMiddleSliceData();
    };

    // @ts-ignore
    voxelManager.setTimePoint = (newTimePoint: number) => {
      timePoint = newTimePoint;
      // @ts-ignore
      voxelManager._get = (index) => voxelGroups[timePoint]._get(index);
      // @ts-ignore
      voxelManager._set = (index, v) => voxelGroups[timePoint]._set(index, v);
    };

    // @ts-ignore
    voxelManager.getAtIndexAndTimePoint = (index: number, tp: number) => {
      return voxelGroups[tp]._get(index);
    };

    // @ts-ignore
    voxelManager.getTimePointScalarData = (tp: number) => {
      return voxelGroups[tp].getCompleteScalarDataArray();
    };

    // @ts-ignore
    // get the given time point complete scalar data array
    voxelManager.getTimePointScalarData = (tp: number) => {
      return voxelGroups[tp].getCompleteScalarDataArray();
    };

    // @ts-ignore
    voxelManager.getCurrentTimePointScalarData = () => {
      return voxelGroups[timePoint].getCompleteScalarDataArray();
    };

    return voxelManager as IVoxelManager<number> | IVoxelManager<RGB>;
  }

  public static createImageVoxelManager({
    width,
    height,
    scalarData,
    numberOfComponents = 1,
  }: {
    width: number;
    height: number;
    scalarData: PixelDataTypedArray;
    numberOfComponents?: number;
  }): IVoxelManager<number> | IVoxelManager<RGB> {
    const dimensions = [width, height, 1] as Point3;
    if (!numberOfComponents) {
      numberOfComponents = scalarData.length / width / height;
      if (
        numberOfComponents > 4 ||
        numberOfComponents < 1 ||
        numberOfComponents === 2
      ) {
        throw new Error(
          `Number of components ${numberOfComponents} must be 1, 3 or 4`
        );
      }
    }
    if (numberOfComponents > 1) {
      return VoxelManager._createRGBScalarVolumeVoxelManager({
        dimensions,
        scalarData,
        numberOfComponents,
      });
    }
    return VoxelManager._createNumberVolumeVoxelManager({
      dimensions,
      scalarData,
    });
  }

  /**
   * Creates a volume voxel manager that works on single numeric values stored
   * in an array like structure of numbers.
   */
  private static _createNumberVolumeVoxelManager({
    dimensions,
    scalarData,
  }: {
    dimensions: Point3;
    scalarData: PixelDataTypedArray;
  }): IVoxelManager<number> {
    const voxels = new VoxelManager<number>(dimensions, {
      _get: (index) => scalarData[index],
      _set: (index, v) => {
        const isChanged = scalarData[index] !== v;
        scalarData[index] = v;
        return isChanged;
      },
      _getConstructor: () =>
        scalarData.constructor as new (length: number) => PixelDataTypedArray,
      _id: '_createNumberVolumeVoxelManager',
    });
    voxels.scalarData = scalarData;
    voxels.clear = () => {
      // get the latest scalar data and set that to all 0
      voxels.scalarData.fill(0);
    };

    voxels.getMiddleSliceData = () => {
      const middleSliceIndex = Math.floor(dimensions[2] / 2);
      return voxels.getSliceData({
        sliceIndex: middleSliceIndex,
        slicePlane: 2,
      });
    };

    return voxels;
  }

  /**
   * Creates a volume map value accessor.  This is initially empty and
   * the map stores the index to value instances.
   * This is useful for sparse matrices containing pixel data.
   */
  public static createMapVoxelManager<T>({
    dimension,
  }: {
    dimension: Point3;
  }): IVoxelManager<T> {
    const map = new Map<number, T>();
    const voxelManager = new VoxelManager<T>(dimension, {
      _get: map.get.bind(map),
      _set: (index, v) => map.set(index, v) && true,
      _id: 'createMapVoxelManager',
    });
    voxelManager.map = map;
    return voxelManager;
  }

  /**
   * Creates a history remembering voxel manager.
   * This will remember the original values in the voxels, and will apply the
   * update to the underlying source voxel manager.
   */
  public static createHistoryVoxelManager<T>({
    sourceVoxelManager,
  }: {
    sourceVoxelManager: VoxelManager<T>;
  }): VoxelManager<T> {
    const map = new Map<number, T>();
    const { dimensions } = sourceVoxelManager;
    const voxelManager = new VoxelManager(dimensions, {
      _get: (index) => map.get(index),
      _set: function (index, v) {
        if (!map.has(index)) {
          const oldV = this.sourceVoxelManager.getAtIndex(index);
          if (oldV === v) {
            // No-op
            return false;
          }
          map.set(index, oldV);
        } else if (v === map.get(index)) {
          map.delete(index);
        }
        this.sourceVoxelManager.setAtIndex(index, v);
      },
      _id: 'createHistoryVoxelManager',
    });
    voxelManager.map = map;
    voxelManager.scalarData = sourceVoxelManager.scalarData;
    voxelManager.sourceVoxelManager = sourceVoxelManager;
    return voxelManager;
  }

  /**
   * Creates a history remembering voxel manager, based on the RLE endpoint
   * rather than a map endpoint.
   * This will remember the original values in the voxels, and will apply the
   * update to the underlying source voxel manager.
   */
  public static createRLEHistoryVoxelManager<T>(
    sourceVoxelManager: VoxelManager<T>
  ): VoxelManager<T> {
    const { dimensions } = sourceVoxelManager;
    const map = new RLEVoxelMap<T>(dimensions[0], dimensions[1], dimensions[2]);
    const voxelManager = new VoxelManager<T>(dimensions, {
      _get: (index) => map.get(index),
      _set: function (index, v) {
        const originalV = map.get(index);
        if (originalV === undefined) {
          const oldV = this.sourceVoxelManager.getAtIndex(index);
          if (oldV === v || (oldV === undefined && v === 0) || v === null) {
            // No-op
            return false;
          }
          map.set(index, oldV ?? 0);
        } else if (v === originalV || v === null) {
          map.delete(index);
          v = originalV;
        }
        this.sourceVoxelManager.setAtIndex(index, v);
      },
      _getScalarData: RLEVoxelMap.getScalarData,
      _updateScalarData: (scalarData) => {
        map.updateScalarData(scalarData as PixelDataTypedArray);
        return scalarData as PixelDataTypedArray;
      },
      _id: 'createRLEHistoryVoxelManager',
    });
    voxelManager.map = map;
    voxelManager.sourceVoxelManager = sourceVoxelManager;
    return voxelManager;
  }

  /**
   * Creates a lazy voxel manager that will create an image plane as required
   * for each slice of a volume as it gets changed.  This can be used to
   * store image data that gets created as required.
   */
  public static createLazyVoxelManager<T>({
    dimensions,
    planeFactory,
  }: {
    dimensions: Point3;
    planeFactory: (width: number, height: number) => T;
  }): VoxelManager<T> {
    const map = new Map<number, T>();
    const [width, height] = dimensions;
    const planeSize = width * height;

    const voxelManager = new VoxelManager(dimensions, {
      _get: (index) =>
        map.get(Math.floor(index / planeSize))[index % planeSize],
      _set: (index, v) => {
        const k = Math.floor(index / planeSize);
        let layer = map.get(k);
        if (!layer) {
          layer = planeFactory(width, height);
          map.set(k, layer);
        }
        layer[index % planeSize] = v;
        return true;
      },
      _id: 'createLazyVoxelManager',
    });
    voxelManager.map = map;
    return voxelManager;
  }

  /**
   * Creates a RLE based voxel manager.  This is effective for storing
   * segmentation maps or already RLE encoded data such as ultrasounds.
   */
  public static createRLEVolumeVoxelManager<T>({
    dimensions,
  }: {
    dimensions: Point3;
  }): VoxelManager<T> {
    const [width, height, depth] = dimensions;
    const map = new RLEVoxelMap<T>(width, height, depth);

    const voxelManager = new VoxelManager<T>(dimensions, {
      _get: (index) => map.get(index),
      _set: (index, v) => {
        map.set(index, v);
        return true;
      },
      _getScalarData: RLEVoxelMap.getScalarData,
      _updateScalarData: (scalarData) => {
        map.updateScalarData(scalarData as PixelDataTypedArray);
        return scalarData as PixelDataTypedArray;
      },
      _id: 'createRLEVolumeVoxelManager',
    });
    voxelManager.map = map;
    // @ts-ignore
    voxelManager.getPixelData = map.getPixelData.bind(map);
    // @ts-ignore
    return voxelManager;
  }

  public static createRLEImageVoxelManager<T>({
    dimensions,
  }: {
    dimensions: Point2;
  }): VoxelManager<T> {
    const [width, height] = dimensions;
    return VoxelManager.createRLEVolumeVoxelManager<T>({
      dimensions: [width, height, 1],
    });
  }

  /**
   * This method adds a voxelManager instance to the image object
   * where the object added is of type:
   * 1. RLE map if the scalar data is missing or too small (dummy data)
   * 2. Volume VoxelManager scalar data representations
   */
  public static addInstanceToImage(image: IImage) {
    const { width, height } = image;
    const scalarData = image.voxelManager.getScalarData();
    // This test works for single images, or single representations of images
    // from a volume representation, for grayscale, indexed and RGB or RGBA images.
    if (scalarData.length >= width * height) {
      // This case means there is enough scalar data for at least one image,
      // with 1 or more components, and creates a volume voxel manager
      // that can lookup the data
      image.voxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: [width, height, 1],
        scalarData,
      });
      return;
    }
    // This case occurs when the image data is a dummy image data set
    // created just to prevent exceptions in the caching logic.  Then, the
    // RLE voxel manager can be created to store the data instead.
    image.voxelManager = VoxelManager.createRLEVolumeVoxelManager<number>({
      dimensions: [width, height, 1],
    });
    // The RLE voxel manager knows how to get scalar data pixel data representations.
    // That allows using the RLE representation as a normal pixel data representation
    // for VIEWING purposes.
    // @ts-ignore
    image.getPixelData = image.voxelManager.getPixelData;
    // Assign a different size to the cached data because this is actually
    // storing an RLE representation, which doesn't have an up front size.
    image.sizeInBytes = DEFAULT_RLE_SIZE;
  }

  public static;
}

export type { VoxelManager };
