// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport';
import VolumeViewport from '../VolumeViewport';
import ViewportType from '../../enums/ViewportType';
import VolumeViewport3D from '../VolumeViewport3D';
import VideoViewport from '../VideoViewport';
import WSIViewport from '../WSIViewport';

const viewportTypeToViewportClass = {
  [ViewportType.ORTHOGRAPHIC]: VolumeViewport,
  [ViewportType.PERSPECTIVE]: VolumeViewport,
  [ViewportType.STACK]: StackViewport,
  [ViewportType.VOLUME_3D]: VolumeViewport3D,
  [ViewportType.VIDEO]: VideoViewport,
  [ViewportType.WholeSlide]: WSIViewport,
};

export default viewportTypeToViewportClass;
