import isTypedArray from '../../utilities/isTypedArray';
import { imageIdToURI } from '../../utilities';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  IVolume,
  VolumeScalarData,
  Metadata,
  Point3,
  IImageVolume,
  Mat3,
  IRetrieveConfiguration,
} from '../../types';

const defaultRetrieveConfiguration: IRetrieveConfiguration = {
  stages: [
    {
      id: 'initialImages',
      positions: [0, 0.5, -1],
      remove: true,
    },
    {
      id: 'quarterThumb',
      decimate: 4,
      offset: 0,
      lossy: 'lossy',
    },
    {
      id: 'halfThumb',
      decimate: 4,
      offset: 2,
      lossy: 'lossy',
    },
    {
      id: 'quarterFull',
      decimate: 4,
      offset: 1,
    },
    {
      id: 'halfFull',
      decimate: 4,
      offset: 3,
    },
    {
      id: 'threeQuarterFull',
      decimate: 4,
      offset: 2,
    },
    {
      id: 'finalFull',
      decimate: 4,
      offset: 0,
    },
  ],
  lossyConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      framesPath: '/lossy/',
      isLossy: true,
      needsScale: true,
    },
  },
};

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume implements IImageVolume {
  private _imageIds: Array<string>;
  private _imageIdsIndexMap = new Map();
  private _imageURIsIndexMap = new Map();
  /** volume scalar data 3D or 4D */
  protected scalarData: VolumeScalarData | Array<VolumeScalarData>;

  /** Read-only unique identifier for the volume */
  readonly volumeId: string;

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
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /**
   * Information on how to retrieve images.
   * No special configuration is required for streaming decoding, as that is
   * done based on the capabilities of the decoder whenever streaming is possible
   */
  retrieveConfiguration: IRetrieveConfiguration;

  constructor(props: IVolume) {
    this.volumeId = props.volumeId;
    this.metadata = props.metadata;
    this.dimensions = props.dimensions;
    this.spacing = props.spacing;
    this.origin = props.origin;
    this.direction = props.direction;
    this.imageData = props.imageData;
    this.scalarData = props.scalarData;
    this.sizeInBytes = props.sizeInBytes;
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance();
    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2];

    if (props.scaling) {
      this.scaling = props.scaling;
    }

    if (props.referencedVolumeId) {
      this.referencedVolumeId = props.referencedVolumeId;
    }
    this.retrieveConfiguration = Object.assign(
      {},
      defaultRetrieveConfiguration,
      props.retrieveConfiguration
    );
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
  public getScalarData(): VolumeScalarData {
    if (isTypedArray(this.scalarData)) {
      return <VolumeScalarData>this.scalarData;
    }

    throw new Error('Unknow scalar data type');
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

  public getRetrieveOptions(transferSyntaxUid = 'unknown', lossyName = '') {
    if (!this.retrieveConfiguration) {
      return null;
    }
    const { lossyConfiguration } = this.retrieveConfiguration;
    if (!lossyConfiguration) {
      return null;
    }
    if (!lossyName) {
      return (
        lossyConfiguration[transferSyntaxUid] || lossyConfiguration.default
      );
    }
    return (
      lossyConfiguration[`${transferSyntaxUid}-${lossyName}`] ||
      lossyConfiguration[`default-${lossyName}`]
    );
  }
}

export default ImageVolume;
