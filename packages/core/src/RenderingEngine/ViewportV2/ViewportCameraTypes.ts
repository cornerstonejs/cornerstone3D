export type ViewAnchor = [number, number];

export type CameraScaleMode = 'fit';

export interface CameraFrame<TAnchorPoint = unknown> {
  anchorPoint?: TAnchorPoint;
  anchorView?: ViewAnchor;
  scale?: number;
  scaleMode?: CameraScaleMode;
  rotation?: number;
}

export interface ViewportCameraBase<TAnchorPoint = unknown> {
  frame?: CameraFrame<TAnchorPoint>;
}
