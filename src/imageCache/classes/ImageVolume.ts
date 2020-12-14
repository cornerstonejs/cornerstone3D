import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import { ImageVolumeInterface, Metadata } from './interfaces';

export default class ImageVolume {
  readonly uid: string;
  metadata: Metadata;
  dimensions: Array<number>;
  spacing: Array<number>;
  origin: Array<number>;
  direction: Array<number>;
  vtkImageData: any;
  scalarData: Float32Array | Uint8Array;
  scaling?: {
    PET?: {
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
    };
  };
  vtkOpenGLTexture: any; // No good way of referencing vtk classes as they aren't classes.

  constructor(props: ImageVolumeInterface) {
    this.uid = props.uid;
    this.metadata = props.metadata;
    this.dimensions = props.dimensions;
    this.spacing = props.spacing;
    this.origin = props.origin;
    this.direction = props.direction;
    this.vtkImageData = props.vtkImageData;
    this.scalarData = props.scalarData;
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance();

    if (props.scaling) {
      this.scaling = props.scaling;
    }
  }
}
