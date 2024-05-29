// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport.js';
import VolumeViewport from '../VolumeViewport.js';
import ViewportType from '../../enums/ViewportType.js';
import VolumeViewport3D from '../VolumeViewport3D.js';
import VideoViewport from '../VideoViewport.js';

const viewportTypeToViewportClass = {
  [ViewportType.ORTHOGRAPHIC]: VolumeViewport,
  [ViewportType.PERSPECTIVE]: VolumeViewport,
  [ViewportType.STACK]: StackViewport,
  [ViewportType.VOLUME_3D]: VolumeViewport3D,
  [ViewportType.VIDEO]: VideoViewport,
};

export default viewportTypeToViewportClass;
