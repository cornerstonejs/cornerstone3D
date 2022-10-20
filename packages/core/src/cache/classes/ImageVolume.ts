import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import { IVolume, Metadata, Point3, IImageVolume, Mat3 } from '../../types';

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume implements IImageVolume {
  /** Read-only unique identifier for the volume */
  readonly volumeId: string;
  /** Dimensions of the volume */
  dimensions: Point3;
  /** volume direction in world space */
  direction: Mat3;
  /** volume metadata */
  metadata: Metadata;
  /** volume origin, Note this is an opinionated origin for the volume */
  origin: Point3;
  /** volume scalar data  */
  scalarData: Float32Array | Uint8Array;
  /** Whether preScaling has been performed on the volume */
  isPrescaled = false;
  /** volume scaling parameters if it contains scaled data */
  scaling?: {
    PET?: {
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
  imageData?: any;
  /** open gl texture for the volume */
  vtkOpenGLTexture: any; // No good way of referencing vtk classes as they aren't classes.
  /** load status object for the volume */
  loadStatus?: Record<string, any>;
  /** optional image ids for the volume if it is made of separated images */
  imageIds?: Array<string>;
  /** optional reference volume id if the volume is derived from another volume */
  referencedVolumeId?: string;
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;

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
  }

  cancelLoading: () => void;
}

export default ImageVolume;
