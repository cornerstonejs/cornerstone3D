import { ImageVolumeInterface } from './interfaces';

export default class ImageVolume {
  uid: string;
  metadata: object;
  dimensions: Array<number>;
  spacing: Array<number>;
  origin: Array<number>;
  direction: Array<number>;
  vtkImageData: object;
  scalarData: Float32Array | Uint8Array;

  constructor(props: ImageVolumeInterface) {
    this.uid = props.uid;
    this.metadata = props.metadata;
    this.dimensions = props.dimensions;
    this.spacing = props.spacing;
    this.origin = props.origin;
    this.direction = props.direction;
    this.vtkImageData = props.vtkImageData;
    this.scalarData = props.scalarData;
  }
}
