import type {
  BoundsIJK,
  Point3,
  PixelDataTypedArray,
  CPUImageData,
  IRLEVoxelMap,
} from '../types';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

interface IVoxelManager<T> {
  // Properties
  _get: (index: number) => T;
  _set: (index: number, v: T) => boolean | void;
  modifiedSlices: Set<number>;
  boundsIJK: BoundsIJK;
  map: Map<number, T> | IRLEVoxelMap<T>;
  sourceVoxelManager: IVoxelManager<T>;
  isInObject: (pointLPS: Point3, pointIJK: Point3) => boolean;
  readonly dimensions: Point3;
  numberOfComponents: number;
  getCompleteScalarDataArray?: () => ArrayLike<number>;
  setCompleteScalarDataArray?: (scalarData: ArrayLike<number>) => void;
  getRange: () => [number, number];
  points: Set<number>;
  width: number;
  frameSize: number;

  // Methods
  getAtIJK(i: number, j: number, k: number): T;
  setAtIJK(i: number, j: number, k: number, v: T): void;
  getAtIJKPoint(point: Point3): T;
  setAtIJKPoint(point: Point3, v: T): void;
  getAtIndex(index: number): T;
  setAtIndex(index: number, v: T): void;
  toIJK(index: number): Point3;
  getMiddleSliceData(): PixelDataTypedArray;
  toIndex(ijk: Point3): number;
  getBoundsIJK(): BoundsIJK;
  forEach(
    callback: (args: {
      value: unknown;
      index: number;
      pointIJK: Point3;
      pointLPS: Point3;
    }) => void,
    options?: {
      boundsIJK?: BoundsIJK;
      isInObject?: (pointLPS: Point3, pointIJK: Point3) => boolean;
      returnPoints?: boolean;
      imageData?: vtkImageData | CPUImageData;
    }
  ): unknown[];
  getScalarData(): PixelDataTypedArray;
  getScalarDataLength(): number;
  get sizeInBytes(): number;
  get bytePerVoxel(): number;
  clear(): void;
  getConstructor(): new (length: number) => PixelDataTypedArray;
  getArrayOfSlices(): number[];
  addPoint(point: Point3 | number): void;
  getPoints(): Point3[];
  getSliceData(args: {
    sliceIndex: number;
    slicePlane: number;
  }): PixelDataTypedArray;

  // Static methods
}

export type { IVoxelManager };
