export type ViewAnchor = [number, number];

export type CameraScale = number | [number, number];

export type CameraScaleMode =
  | 'fit'
  | 'fitAspect'
  | 'fitWidth'
  | 'fitHeight'
  | 'absolute';

export interface CameraFrame<TAnchorWorld = unknown, TScale = number> {
  anchorWorld?: TAnchorWorld;
  anchorCanvas?: ViewAnchor;
  scale?: TScale;
  scaleMode?: CameraScaleMode;
  rotation?: number;
}

export interface ViewportCameraBase<TAnchorWorld = unknown, TScale = number>
  extends CameraFrame<TAnchorWorld, TScale> {}
