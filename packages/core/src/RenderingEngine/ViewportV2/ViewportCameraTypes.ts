export type ViewAnchor = [number, number];

export type CameraScaleMode = 'fit';

export interface CameraFrame<TAnchorWorld = unknown> {
  anchorWorld?: TAnchorWorld;
  anchorCanvas?: ViewAnchor;
  scale?: number;
  scaleMode?: CameraScaleMode;
  rotation?: number;
}

export interface ViewportCameraBase<TAnchorWorld = unknown> {
  frame?: CameraFrame<TAnchorWorld>;
}
