// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport';
import VolumeViewport from '../VolumeViewport';
import ViewportType from '../../enums/ViewportType';
import VolumeViewport3D from '../VolumeViewport3D';
import VideoViewport from '../VideoViewport';
import WSIViewport from '../WSIViewport';
import ECGViewport from '../ECGViewport';
import type { ViewportInput, IViewport } from '../../types/IViewport';

interface ViewportConstructor {
  new (viewportInput: ViewportInput): IViewport;
}

const viewportTypeToViewportClass: {
  [key: string]: ViewportConstructor;
} = {
  [ViewportType.ORTHOGRAPHIC]: VolumeViewport,
  [ViewportType.PERSPECTIVE]: VolumeViewport,
  [ViewportType.STACK]: StackViewport,
  [ViewportType.VOLUME_3D]: VolumeViewport3D,
  [ViewportType.VIDEO]: VideoViewport,
  [ViewportType.WHOLE_SLIDE]: WSIViewport,
  [ViewportType.ECG]: ECGViewport,
};

export default viewportTypeToViewportClass;
