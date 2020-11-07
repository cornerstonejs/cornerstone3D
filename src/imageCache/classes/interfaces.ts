export interface ImageVolumeInterface {
  uid: string;
  metadata: object;
  dimensions: Array<number>;
  spacing: Array<number>;
  origin: Array<number>;
  direction: Array<number>;
  vtkImageData: object;
  scalarData: Float32Array | Uint8Array;
}

export interface StreamingInterface {
  imageIds: Array<string>;
  loadStatus: {
    loaded: Boolean;
    cachedFrames: Array<Boolean>;
    callbacks: Array<Function>;
  };
}
