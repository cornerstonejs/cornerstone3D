import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import isTypedArray from '../../utilities/isTypedArray';
import {
  genericMetadataProvider,
  getMinMax,
  imageIdToURI,
} from '../../utilities';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import {
  Metadata,
  Point3,
  IImageVolume,
  Mat3,
  PixelDataTypedArray,
  ImageVolumeProps,
  IImage,
  IImageLoadObject,
} from '../../types';
import cache from '../cache';
import * as metaData from '../../metaData';

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume implements IImageVolume {
  private _imageIds: Array<string>;
  private _imageIdsIndexMap = new Map();
  private _imageURIsIndexMap = new Map();
  /** volume scalar data 3D or 4D */
  protected scalarData: PixelDataTypedArray | Array<PixelDataTypedArray>;
  protected numFrames: number;
  protected totalNumFrames: number;
  protected cornerstoneImageMetaData = null;

  /** Read-only unique identifier for the volume */
  readonly volumeId: string;

  imageCacheOffsetMap = new Map();

  isPreScaled = false;

  /** Dimensions of the volume */
  dimensions: Point3;
  /** volume direction in world space */
  direction: Mat3;
  /** volume metadata */
  metadata: Metadata;
  /** volume origin, Note this is an opinionated origin for the volume */
  origin: Point3;
  /** Whether preScaling has been performed on the volume */
  /** volume scaling parameters if it contains scaled data */
  scaling?: {
    PT?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      // accessed in ProbeTool
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** volume size in bytes */
  sizeInBytes?: number; // Seems weird to pass this in? Why not grab it from scalarData.byteLength
  /** volume spacing in 3d world space */
  spacing: Point3;
  /** volume number of voxels */
  numVoxels: number;
  /** volume image data */
  imageData?: vtkImageData;
  /** open gl texture for the volume */
  vtkOpenGLTexture: any; // No good way of referencing vtk classes as they aren't classes.
  /** load status object for the volume */
  loadStatus?: Record<string, any>;
  /** optional reference volume id if the volume is derived from another volume */
  referencedVolumeId?: string;
  /** optional reference image ids if the volume is derived from a set of images in the image cache */
  referencedImageIds?: Array<string>;
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /** Property to store additional information */
  additionalDetails?: Record<string, any>;

  constructor(props: ImageVolumeProps) {
    const {
      imageIds,
      scalarData,
      scaling,
      dimensions,
      spacing,
      origin,
      direction,
      volumeId,
      referencedVolumeId,
      sizeInBytes,
      imageData,
      metadata,
      referencedImageIds,
      additionalDetails,
    } = props;

    this.imageIds = imageIds;
    this.volumeId = volumeId;
    this.metadata = metadata;
    this.dimensions = dimensions;
    this.spacing = spacing;
    this.origin = origin;
    this.direction = direction;
    this.scalarData = scalarData;
    this.sizeInBytes = sizeInBytes;
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance();
    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2];

    if (imageData) {
      this.imageData = imageData;
    } else {
      const imageData = vtkImageData.newInstance();

      const scalarArray = vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: scalarData,
      });

      imageData.setDimensions(dimensions);
      imageData.setSpacing(spacing);
      imageData.setDirection(direction);
      imageData.setOrigin(origin);
      imageData.getPointData().setScalars(scalarArray);

      this.imageData = imageData;
    }

    this.numFrames = this._getNumFrames();
    this._reprocessImageIds();
    this._createCornerstoneImageMetaData();

    if (scaling) {
      this.scaling = scaling;
    }

    if (referencedVolumeId) {
      this.referencedVolumeId = referencedVolumeId;
    }

    if (referencedImageIds) {
      this.referencedImageIds = referencedImageIds;
    }

    if (additionalDetails) {
      this.additionalDetails = additionalDetails;
    }
  }

  /** return the image ids for the volume if it is made of separated images */
  public get imageIds(): Array<string> {
    return this._imageIds;
  }

  /** updates the image ids */
  public set imageIds(newImageIds: Array<string>) {
    this._imageIds = newImageIds;
    this._reprocessImageIds();
  }

  private _reprocessImageIds() {
    this._imageIdsIndexMap.clear();
    this._imageURIsIndexMap.clear();

    this._imageIds.forEach((imageId, i) => {
      const imageURI = imageIdToURI(imageId);

      this._imageIdsIndexMap.set(imageId, i);
      this._imageURIsIndexMap.set(imageURI, i);
    });
  }

  cancelLoading: () => void;

  /** return true if it is a 4D volume or false if it is 3D volume */
  public isDynamicVolume(): boolean {
    return false;
  }

  /**
   * Return the scalar data for 3D volumes or the active scalar data
   * (current time point) for 4D volumes
   */
  public getScalarData(): PixelDataTypedArray {
    if (isTypedArray(this.scalarData)) {
      return <PixelDataTypedArray>this.scalarData;
    }

    throw new Error('Unknown scalar data type');
  }

  /**
   * return the index of a given imageId
   * @param imageId - imageId
   * @returns imageId index
   */
  public getImageIdIndex(imageId: string): number {
    return this._imageIdsIndexMap.get(imageId);
  }

  /**
   * return the index of a given imageURI
   * @param imageId - imageURI
   * @returns imageURI index
   */
  public getImageURIIndex(imageURI: string): number {
    return this._imageURIsIndexMap.get(imageURI);
  }

  /**
   * destroy the volume and make it unusable
   */
  destroy(): void {
    // TODO: GPU memory associated with volume is not cleared.
    this.imageData.delete();
    this.imageData = null;
    this.scalarData = null;

    this.vtkOpenGLTexture.releaseGraphicsResources();
    this.vtkOpenGLTexture.delete();
  }

  /**
   * Return all scalar data objects (buffers) which will be only one for
   * 3D volumes and one per time point for 4D volumes
   * images of each 3D volume is stored
   * @returns scalar data array
   */
  public getScalarDataArrays(): PixelDataTypedArray[] {
    return this.isDynamicVolume()
      ? <PixelDataTypedArray[]>this.scalarData
      : [<PixelDataTypedArray>this.scalarData];
  }

  /**
   * Updates the internals of the volume to reflect the changes in the
   * underlying scalar data. This should be called when the scalar data
   * is modified externally
   */
  public modified() {
    this.imageData.modified();

    if (this.isDynamicVolume()) {
      throw new Error('Not implemented');
    } else {
      this.scalarData = this.imageData
        .getPointData()
        .getScalars()
        .getData() as PixelDataTypedArray;
    }

    this.numFrames = this._getNumFrames();
  }

  /**
   * If completelyRemove is true, remove the volume completely from the cache. Otherwise,
   * convert the volume to cornerstone images (stack images) and store it in the cache
   * @param completelyRemove - If true, the image will be removed from the
   * cache completely.
   */
  public decache(completelyRemove = false): void | Array<string> {
    if (completelyRemove) {
      this.removeFromCache();
    } else {
      this.convertToImageSlicesAndCache();
    }
  }

  public removeFromCache() {
    cache.removeVolumeLoadObject(this.volumeId);
  }

  public getScalarDataLength(): number {
    const { scalarData } = this;
    return this.isDynamicVolume()
      ? (<PixelDataTypedArray[]>scalarData)[0].length
      : (<PixelDataTypedArray>scalarData).length;
  }

  /**
   * Returns the number of frames stored in a scalarData object. The number of
   * frames is equal to the number of images for 3D volumes or the number of
   * frames per time poins for 4D volumes.
   * @returns number of frames per volume
   */
  private _getNumFrames(): number {
    const { imageIds, scalarData } = this;
    const scalarDataCount = this.isDynamicVolume() ? scalarData.length : 1;

    return imageIds.length / scalarDataCount;
  }

  private _getScalarDataLength(): number {
    const { scalarData } = this;
    return this.isDynamicVolume()
      ? (<PixelDataTypedArray[]>scalarData)[0].length
      : (<PixelDataTypedArray>scalarData).length;
  }

  /**
   * Creates the metadata required for converting the volume to an cornerstoneImage
   */
  private _createCornerstoneImageMetaData() {
    const { numFrames } = this;

    if (numFrames === 0) {
      return;
    }

    const bytesPerImage = this.sizeInBytes / numFrames;
    const scalarDataLength = this._getScalarDataLength();
    const numComponents = scalarDataLength / this.numVoxels;
    const pixelsPerImage =
      this.dimensions[0] * this.dimensions[1] * numComponents;

    const { PhotometricInterpretation, voiLut, VOILUTFunction } = this.metadata;

    let windowCenter = [];
    let windowWidth = [];

    if (voiLut && voiLut.length) {
      windowCenter = voiLut.map((voi) => {
        return voi.windowCenter;
      });

      windowWidth = voiLut.map((voi) => {
        return voi.windowWidth;
      });
    }

    const color = numComponents > 1 ? true : false; //todo: fix this

    this.cornerstoneImageMetaData = {
      bytesPerImage,
      numComponents,
      pixelsPerImage,
      windowCenter,
      windowWidth,
      color,
      // we use rgb (3 components) for the color volumes (and not rgba), and not rgba (which is used
      // in some parts of the lib for stack viewing in CPU)
      rgba: false,
      spacing: this.spacing,
      dimensions: this.dimensions,
      photometricInterpretation: PhotometricInterpretation,
      voiLUTFunction: VOILUTFunction,
      invert: PhotometricInterpretation === 'MONOCHROME1',
    };
  }

  protected getScalarDataByImageIdIndex(
    imageIdIndex: number
  ): PixelDataTypedArray {
    if (imageIdIndex < 0 || imageIdIndex >= this.imageIds.length) {
      throw new Error('imageIdIndex out of range');
    }

    const scalarDataArrays = this.getScalarDataArrays();
    const scalarDataIndex = Math.floor(imageIdIndex / this.numFrames);

    return scalarDataArrays[scalarDataIndex];
  }

  /**
   * Converts the requested imageId inside the volume to a cornerstoneImage
   * object. It uses the typedArray set method to copy the pixelData from the
   * correct offset in the scalarData to a new array for the image
   *
   * @param imageId - the imageId of the image to be converted
   * @param imageIdIndex - the index of the imageId in the imageIds array
   * @returns image object containing the pixel data, metadata, and other information
   */
  public getCornerstoneImage(imageId: string, imageIdIndex: number): IImage {
    const { imageIds } = this;
    const frameIndex = this.imageIdIndexToFrameIndex(imageIdIndex);

    const {
      bytesPerImage,
      pixelsPerImage,
      windowCenter,
      windowWidth,
      numComponents,
      color,
      dimensions,
      spacing,
      invert,
      voiLUTFunction,
      photometricInterpretation,
    } = this.cornerstoneImageMetaData;

    // 1. Grab the buffer and it's type
    const scalarData = this.getScalarDataByImageIdIndex(imageIdIndex);
    const volumeBuffer = scalarData.buffer;
    // (not sure if this actually works, TypeScript keeps complaining)
    const TypedArray = scalarData.constructor;

    // 2. Given the index of the image and frame length in bytes,
    //    create a view on the volume arraybuffer
    const bytePerPixel = bytesPerImage / pixelsPerImage;

    let byteOffset = bytesPerImage * frameIndex;

    // If there is a discrepancy between the volume typed array
    // and the bitsAllocated for the image. The reason is that VTK uses Float32
    // on the GPU and if the type is not Float32, it will convert it. So for not
    // having a performance issue, we convert all types initially to Float32 even
    // if they are not Float32.
    if (scalarData.BYTES_PER_ELEMENT !== bytePerPixel) {
      byteOffset *= scalarData.BYTES_PER_ELEMENT / bytePerPixel;
    }

    // 3. Create a new TypedArray of the same type for the new
    //    Image that will be created
    // @ts-ignore
    const imageScalarData = new TypedArray(pixelsPerImage);
    // @ts-ignore
    const volumeBufferView = new TypedArray(
      volumeBuffer,
      byteOffset,
      pixelsPerImage
    );

    // 4. Use e.g. TypedArray.set() to copy the data from the larger
    //    buffer's view into the smaller one
    imageScalarData.set(volumeBufferView);

    // 5. Create an Image Object from imageScalarData and put it into the Image cache
    const volumeImageId = imageIds[imageIdIndex];
    const modalityLutModule =
      metaData.get('modalityLutModule', volumeImageId) || {};
    const minMax = getMinMax(imageScalarData);
    const intercept = modalityLutModule.rescaleIntercept
      ? modalityLutModule.rescaleIntercept
      : 0;

    return {
      imageId,
      intercept,
      windowCenter,
      windowWidth,
      voiLUTFunction,
      color,
      rgba: false,
      numComps: numComponents,
      // Note the dimensions were defined as [Columns, Rows, Frames]
      rows: dimensions[1],
      columns: dimensions[0],
      sizeInBytes: imageScalarData.byteLength,
      getPixelData: () => imageScalarData,
      minPixelValue: minMax.min,
      maxPixelValue: minMax.max,
      slope: modalityLutModule.rescaleSlope
        ? modalityLutModule.rescaleSlope
        : 1,
      getCanvas: undefined, // todo: which canvas?
      height: dimensions[0],
      width: dimensions[1],
      columnPixelSpacing: spacing[0],
      rowPixelSpacing: spacing[1],
      invert,
      photometricInterpretation,
    };
  }

  /**
   * Converts imageIdIndex into frameIndex which will be the same
   * for 3D volumes but different for 4D volumes. The indices are 0 based.
   */
  protected imageIdIndexToFrameIndex(imageIdIndex: number): number {
    return imageIdIndex % this.numFrames;
  }

  /**
   * Converts the requested imageId inside the volume to a cornerstoneImage
   * object. It uses the typedArray set method to copy the pixelData from the
   * correct offset in the scalarData to a new array for the image
   * Duplicate of getCornerstoneImageLoadObject for legacy reasons
   *
   * @param imageId - the imageId of the image to be converted
   * @param imageIdIndex - the index of the imageId in the imageIds array
   * @returns imageLoadObject containing the promise that resolves
   * to the cornerstone image
   */
  public convertToCornerstoneImage(
    imageId: string,
    imageIdIndex: number
  ): IImageLoadObject {
    return this.getCornerstoneImageLoadObject(imageId, imageIdIndex);
  }

  /**
   * Converts the requested imageId inside the volume to a cornerstoneImage
   * object. It uses the typedArray set method to copy the pixelData from the
   * correct offset in the scalarData to a new array for the image
   *
   * @param imageId - the imageId of the image to be converted
   * @param imageIdIndex - the index of the imageId in the imageIds array
   * @returns imageLoadObject containing the promise that resolves
   * to the cornerstone image
   */
  public getCornerstoneImageLoadObject(
    imageId: string,
    imageIdIndex: number
  ): IImageLoadObject {
    const image = this.getCornerstoneImage(imageId, imageIdIndex);

    const imageLoadObject = {
      promise: Promise.resolve(image),
    };

    return imageLoadObject;
  }

  /**
   * Returns an array of all the volume's images as Cornerstone images.
   * It iterates over all the imageIds and converts them to Cornerstone images.
   *
   * @returns An array of Cornerstone images.
   */
  public getCornerstoneImages(): IImage[] {
    const { imageIds } = this;

    return imageIds.map((imageId, imageIdIndex) => {
      return this.getCornerstoneImage(imageId, imageIdIndex);
    });
  }

  /**
   * Converts all the volume images (imageIds) to cornerstoneImages and caches them.
   * It iterates over all the imageIds and convert them until there is no
   * enough space left inside the imageCache. Finally it will decache the Volume.
   *
   */
  public convertToImageSlicesAndCache() {
    // 1. Try to decache images in the volatile Image Cache to provide
    //    enough space to store another entire copy of the volume (as Images).
    //    If we do not have enough, we will store as many images in the cache
    //    as possible, and the rest of the volume will be decached.
    const byteLength = this.sizeInBytes;

    if (!this.imageIds?.length) {
      // generate random imageIds
      // check if the referenced volume has imageIds to see how many
      // images we need to generate
      const referencedVolumeId = this.referencedVolumeId;

      let numSlices = this.dimensions[2];
      if (referencedVolumeId) {
        const referencedVolume = cache.getVolume(referencedVolumeId);
        numSlices = referencedVolume?.imageIds?.length ?? numSlices;
      }

      this.imageIds = Array.from({ length: numSlices }, (_, i) => {
        return `generated:${this.volumeId}:${i}`;
      });

      this._reprocessImageIds();
      this.numFrames = this._getNumFrames();
      this._createCornerstoneImageMetaData();
    }

    const numImages = this.imageIds.length;
    const { bytesPerImage } = this.cornerstoneImageMetaData;
    let bytesRemaining = cache.decacheIfNecessaryUntilBytesAvailable(
      byteLength,
      this.imageIds
    );

    for (let imageIdIndex = 0; imageIdIndex < numImages; imageIdIndex++) {
      const imageId = this.imageIds[imageIdIndex];

      bytesRemaining = bytesRemaining - bytesPerImage;

      // 2. Convert each imageId to a cornerstone Image object which is
      // resolved inside the promise of imageLoadObject
      const image = this.getCornerstoneImage(imageId, imageIdIndex);

      const imageLoadObject = {
        promise: Promise.resolve(image),
      };

      // 3. Caching the image
      if (!cache.getImageLoadObject(imageId)) {
        cache.putImageLoadObject(imageId, imageLoadObject).catch((err) => {
          console.error(err);
        });
      }

      // 4. If we know we won't be able to add another Image to the cache
      //    without breaching the limit, stop here.
      if (bytesRemaining <= bytesPerImage) {
        break;
      }

      const imageOrientationPatient = [
        this.direction[0],
        this.direction[1],
        this.direction[2],
        this.direction[3],
        this.direction[4],
        this.direction[5],
      ];

      const precision = 6;
      const imagePositionPatient = [
        parseFloat(
          (
            this.origin[0] +
            imageIdIndex * this.direction[6] * this.spacing[0]
          ).toFixed(precision)
        ),
        parseFloat(
          (
            this.origin[1] +
            imageIdIndex * this.direction[7] * this.spacing[1]
          ).toFixed(precision)
        ),
        parseFloat(
          (
            this.origin[2] +
            imageIdIndex * this.direction[8] * this.spacing[2]
          ).toFixed(precision)
        ),
      ];

      const pixelData = image.getPixelData();
      const bitsAllocated = pixelData.BYTES_PER_ELEMENT * 8;

      const imagePixelModule = {
        // bitsStored: number;
        // samplesPerPixel: number;
        // highBit: number;
        // pixelRepresentation: string;
        // modality: string;
        bitsAllocated,
        photometricInterpretation: image.photometricInterpretation,
        windowWidth: image.windowWidth,
        windowCenter: image.windowCenter,
        voiLUTFunction: image.voiLUTFunction,
      };

      const imagePlaneModule = {
        rowCosines: [this.direction[0], this.direction[1], this.direction[2]],
        columnCosines: [
          this.direction[3],
          this.direction[4],
          this.direction[5],
        ],
        pixelSpacing: [this.spacing[0], this.spacing[1]],
        // sliceLocation?: number;
        // sliceThickness?: number;
        // frameOfReferenceUID: string;
        imageOrientationPatient: imageOrientationPatient,
        imagePositionPatient: imagePositionPatient,
        columnPixelSpacing: image.columnPixelSpacing,
        rowPixelSpacing: image.rowPixelSpacing,
        columns: image.columns,
        rows: image.rows,
      };

      const generalSeriesModule = {
        // modality: image.modality,
        // seriesInstanceUID: string;
        // seriesNumber: number;
        // studyInstanceUID: string;
        // seriesDate: DicomDateObject;
        // seriesTime: DicomTimeObject;
      };

      const metadata = {
        imagePixelModule,
        imagePlaneModule,
        generalSeriesModule,
      };

      ['imagePixelModule', 'imagePlaneModule', 'generalSeriesModule'].forEach(
        (type) => {
          genericMetadataProvider.add(imageId, {
            type,
            metadata: metadata[type],
          });
        }
      );
    }
    // 5. When as much of the Volume is processed into Images as possible
    // without breaching the cache limit, remove the Volume
    // but first check if the volume is referenced as a derived
    // volume by another volume, then we need to update their referencedVolumeId
    // to be now the referencedImageIds of this volume
    const otherVolumes = cache.filterVolumesByReferenceId(this.volumeId);

    if (otherVolumes.length) {
      otherVolumes.forEach((volume) => {
        volume.referencedImageIds = this.imageIds;
      });
    }

    this.removeFromCache();

    return this.imageIds;
  }
}

export default ImageVolume;
