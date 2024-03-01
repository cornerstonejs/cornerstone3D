import type {
  BoundsIJK,
  Point3,
  PixelDataTypedArray,
  IImage,
  RGB,
} from '../types';
import RLEVoxelMap from './RLEVoxelMap';
import isEqual from './isEqual';

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
  public boundsIJK = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as BoundsIJK;

  // Provide direct access to the underlying data, if any
  public scalarData: PixelDataTypedArray;
  public map: Map<number, T> | RLEVoxelMap<T>;
  public sourceVoxelManager: VoxelManager<T>;
  public isInObject: (pointIPS, pointIJK) => boolean;
  public readonly dimensions: Point3;
  public numComps = 1;

  points: Set<number>;
  width: number;
  frameSize: number;
  _get: (index: number) => T;
  _set: (index: number, v: T) => boolean | void;

  /**
   * Creates a generic voxel value accessor, with access to the values
   * provided by the _get and optionally _set values.
   * @param dimensions - for the voxel volume
   * @param _get - called to get a value by index
   * @param _set  - called when setting a value
   */
  constructor(
    dimensions,
    _get: (index: number) => T,
    _set?: (index: number, v: T) => boolean | void
  ) {
    this.dimensions = dimensions;
    this.width = dimensions[0];
    this.frameSize = this.width * dimensions[1];
    this._get = _get;
    this._set = _set;
  }

  /**
   * Gets the voxel value at position i,j,k.
   */
  public getAtIJK = (i, j, k) => {
    const index = i + j * this.width + k * this.frameSize;
    return this._get(index);
  };

  /**
   * Sets the voxel value at position i,j,k and records the slice
   * that was modified.
   */
  public setAtIJK = (i: number, j: number, k: number, v) => {
    const index = i + j * this.width + k * this.frameSize;
    if (this._set(index, v) !== false) {
      this.modifiedSlices.add(k);
      VoxelManager.addBounds(this.boundsIJK, [i, j, k]);
    }
  };

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
   * Gets the points added using addPoint as an array of indices.
   */
  public getPointIndices(): number[] {
    return this.points ? [...this.points] : [];
  }

  /**
   * Gets the voxel value at the given Point3 location.
   */
  public getAtIJKPoint = ([i, j, k]) => this.getAtIJK(i, j, k);

  /**
   * Sets the voxel value at the given point3 location to the specified value.
   * Records the z index modified.
   * Will record the index value if the VoxelManager is backed by a map.
   */
  public setAtIJKPoint = ([i, j, k]: Point3, v) => this.setAtIJK(i, j, k, v);

  /**
   * Gets the value at the given index.
   */
  public getAtIndex = (index) => this._get(index);

  /**
   * Sets the value at the given index
   */
  public setAtIndex = (index, v) => {
    if (this._set(index, v) !== false) {
      const pointIJK = this.toIJK(index);
      this.modifiedSlices.add(pointIJK[2]);
      VoxelManager.addBounds(this.boundsIJK, pointIJK);
    }
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

  /**
   * Converts an IJK Point3 value to an index value
   */
  public toIndex(ijk: Point3) {
    return ijk[0] + ijk[1] * this.width + ijk[2] * this.frameSize;
  }

  /**
   * Gets the bounds for the modified set of values.
   */
  public getBoundsIJK(): BoundsIJK {
    if (this.boundsIJK[0][0] < this.dimensions[0]) {
      return this.boundsIJK;
    }
    return this.dimensions.map((dimension) => [0, dimension - 1]) as BoundsIJK;
  }

  /**
   * Iterate over the points within the bounds, or the modified points if recorded.
   */
  public forEach = (callback, options?) => {
    const boundsIJK = options?.boundsIJK || this.getBoundsIJK();
    const { isWithinObject } = options || {};
    if (this.map) {
      // Optimize this for only values in the map
      for (const index of this.map.keys()) {
        const pointIJK = this.toIJK(index);
        const value = this._get(index);
        const callbackArguments = { value, index, pointIJK };
        if (isWithinObject?.(callbackArguments) === false) {
          continue;
        }
        callback(callbackArguments);
      }
    } else {
      for (let k = boundsIJK[2][0]; k <= boundsIJK[2][1]; k++) {
        const kIndex = k * this.frameSize;
        for (let j = boundsIJK[1][0]; j <= boundsIJK[1][1]; j++) {
          const jIndex = kIndex + j * this.width;
          for (
            let i = boundsIJK[0][0], index = jIndex + i;
            i <= boundsIJK[0][1];
            i++, index++
          ) {
            const value = this.getAtIndex(index);
            const callbackArguments = { value, index, pointIJK: [i, j, k] };
            if (isWithinObject?.(callbackArguments) === false) {
              continue;
            }
            callback(callbackArguments);
          }
        }
      }
    }
  };

  /**
   * Clears any map specific data, as wellas the modified slices, points and
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
   * @returns The array of modified k indices
   */
  public getArrayOfSlices(): number[] {
    return Array.from(this.modifiedSlices);
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
   * Gets the pixel data for the given array.
   */
  public getPixelData: (
    sliceIndex?: number,
    pixelData?: PixelDataTypedArray
  ) => PixelDataTypedArray;

  /**
   * Creates a voxel manager backed by an array of scalar data having the
   * given number of components.
   * Note that the number of components can be larger than three, in case data
   * is stored in additional pixels.  However, the return type is still RGB.
   */
  public static createRGBVolumeVoxelManager(
    dimensions: Point3,
    scalarData,
    numComponents
  ): VoxelManager<RGB> {
    const voxels = new VoxelManager<RGB>(
      dimensions,
      (index) => {
        index *= numComponents;
        return [scalarData[index++], scalarData[index++], scalarData[index++]];
      },
      (index, v) => {
        index *= 3;
        const isChanged = !isEqual(scalarData[index], v);
        scalarData[index++] = v[0];
        scalarData[index++] = v[1];
        scalarData[index++] = v[2];
        return isChanged;
      }
    );
    voxels.numComps = numComponents;
    voxels.scalarData = scalarData;
    return voxels;
  }

  /**
   *  Creates a volume value accessor, based on a volume scalar data instance.
   * This also works for image value accessors for single plane (k=0) accessors.
   */
  public static createVolumeVoxelManager(
    dimensions: Point3,
    scalarData,
    numComponents = 0
  ): VoxelManager<number> | VoxelManager<RGB> {
    if (dimensions.length !== 3) {
      throw new Error(
        'Dimensions must be provided as [number, number, number] for [width, height, depth]'
      );
    }
    if (!numComponents) {
      numComponents =
        scalarData.length / dimensions[0] / dimensions[1] / dimensions[2];
      // We only support 1,3,4 component data, and sometimes the scalar data
      // doesn't match for some reason, so throw an exception
      if (numComponents > 4 || numComponents < 1 || numComponents === 2) {
        throw new Error(
          `Number of components ${numComponents} must be 1, 3 or 4`
        );
      }
    }
    if (numComponents > 1) {
      return VoxelManager.createRGBVolumeVoxelManager(
        dimensions,
        scalarData,
        numComponents
      );
    }
    return VoxelManager.createNumberVolumeVoxelManager(dimensions, scalarData);
  }

  /**
   * Creates a volume voxel manager that works on single numeric values stored
   * in an array like structure of numbers.
   */
  public static createNumberVolumeVoxelManager(
    dimensions: Point3,
    scalarData
  ): VoxelManager<number> {
    const voxels = new VoxelManager<number>(
      dimensions,
      (index) => scalarData[index],
      (index, v) => {
        const isChanged = scalarData[index] !== v;
        scalarData[index] = v;
        return isChanged;
      }
    );
    voxels.scalarData = scalarData;
    return voxels;
  }

  /**
   * Creates a volume map value accessor.  This is initially empty and
   * the map stores the index to value instances.
   * This is useful for sparse matrices containing pixel data.
   */
  public static createMapVoxelManager<T>(dimension: Point3): VoxelManager<T> {
    const map = new Map<number, T>();
    const voxelManager = new VoxelManager(
      dimension,
      map.get.bind(map),
      (index, v) => map.set(index, v) && true
    );
    voxelManager.map = map;
    return voxelManager;
  }

  /**
   * Creates a history remembering voxel manager.
   * This will remember the original values in the voxels, and will apply the
   * update to the underlying source voxel manager.
   */
  public static createHistoryVoxelManager<T>(
    sourceVoxelManager: VoxelManager<T>
  ): VoxelManager<T> {
    const map = new Map<number, T>();
    const { dimensions } = sourceVoxelManager;
    const voxelManager = new VoxelManager(
      dimensions,
      (index) => map.get(index),
      function (index, v) {
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
      }
    );
    voxelManager.map = map;
    voxelManager.scalarData = sourceVoxelManager.scalarData;
    voxelManager.sourceVoxelManager = sourceVoxelManager;
    return voxelManager;
  }

  /**
   * Creates a lazy voxel manager that will create an image plane as required
   * for each slice of a volume as it gets changed.  This can be used to
   * store image data that gets created as required.
   */
  public static createLazyVoxelManager<T>(
    dimensions: Point3,
    planeFactory: (width: number, height: number) => T
  ): VoxelManager<T> {
    const map = new Map<number, T>();
    const [width, height, depth] = dimensions;
    const planeSize = width * height;

    const voxelManager = new VoxelManager(
      dimensions,
      (index) => map.get(Math.floor(index / planeSize))?.[index % planeSize],
      (index, v) => {
        const k = Math.floor(index / planeSize);
        let layer = map.get(k);
        if (!layer) {
          layer = planeFactory(width, height);
          map.set(k, layer);
        }
        layer[index % planeSize] = v;
      }
    );
    voxelManager.map = map;
    return voxelManager;
  }

  /**
   * Creates a RLE based voxel manager.  This is effective for storing
   * segmentation maps or already RLE encoded data such as ultrasounds.
   */
  public static createRLEVoxelManager<T>(dimensions: Point3): VoxelManager<T> {
    const [width, height, depth] = dimensions;
    const map = new RLEVoxelMap<T>(width, height, depth);

    const voxelManager = new VoxelManager<T>(
      dimensions,
      (index) => map.get(index),
      (index, v) => map.set(index, v)
    );
    voxelManager.map = map;
    voxelManager.getPixelData = map.getPixelData.bind(map);
    return voxelManager;
  }

  /**
   * This method adds a voxelManager instance to the image object
   * where the object added is of type:
   * 1. RLE map if the scalar data is missing or too small (dummy data)
   * 2. Volume VoxelManager scalar data representations
   */
  public static addInstanceToImage(image: IImage) {
    const { width, height } = image;
    const scalarData = image.getPixelData();
    // This test works for single images, or single representations of images
    // from a volume representation, for grayscale, indexed and RGB or RGBA images.
    if (scalarData?.length >= width * height) {
      // This case means there is enough scalar data for at least one image,
      // with 1 or more components, and creates a volume voxel manager
      // that can lookup the data
      image.voxelManager = VoxelManager.createVolumeVoxelManager(
        [width, height, 1],
        scalarData
      );
      return;
    }
    // This case occurs when the image data is a dummy image data set
    // created just to prevent exceptions in the caching logic.  Then, the
    // RLE voxel manager can be created to store the data instead.
    image.voxelManager = VoxelManager.createRLEVoxelManager<number>([
      width,
      height,
      1,
    ]);
    // The RLE voxel manager knows how to get scalar data pixel data representations.
    // That allows using the RLE representation as a normal pixel data representation
    // for VIEWING purposes.
    image.getPixelData = image.voxelManager.getPixelData;
    // Assign a different size to the cached data because this is actually
    // storing an RLE representation, which doesn't have an up front size.
    image.sizeInBytes = DEFAULT_RLE_SIZE;
  }
}

export type { VoxelManager };
