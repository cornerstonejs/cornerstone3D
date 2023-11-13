// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport';
import VolumeViewport from '../VolumeViewport';
import ViewportType from '../../enums/ViewportType';
import VolumeViewport3D from '../VolumeViewport3D';
import VideoViewport from '../VideoViewport';

const viewportTypeToViewportClass = {
  [ViewportType.ORTHOGRAPHIC]: VolumeViewport,
  [ViewportType.PERSPECTIVE]: VolumeViewport,
  [ViewportType.STACK]: StackViewport,
  [ViewportType.VOLUME_3D]: VolumeViewport3D,
  [ViewportType.VIDEO]: VideoViewport,
};

export default viewportTypeToViewportClass;
