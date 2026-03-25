// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport';
import VolumeViewport from '../VolumeViewport';
import ViewportType from '../../enums/ViewportType';
import VolumeViewport3D from '../VolumeViewport3D';
import VideoViewport from '../VideoViewport';
import WSIViewport from '../WSIViewport';
import ECGViewport from '../ECGViewport';
import ECGViewportNext from '../ViewportNext/ECG/ECGViewportNext';
import PlanarViewport from '../ViewportNext/Planar/PlanarViewport';
import VideoViewportNext from '../ViewportNext/Video/VideoViewportNext';
import VolumeViewport3DV2 from '../ViewportNext/Volume3D/3dViewport';
import WSIViewportNext from '../ViewportNext/WSI/WSIViewportNext';
import type { ViewportInput, IViewport } from '../../types/IViewport';

interface ViewportConstructor {
  new (
    viewportInput: ViewportInput
  ):
    | IViewport
    | PlanarViewport
    | VideoViewportNext
    | VolumeViewport3DV2
    | ECGViewportNext;
}

const viewportTypeToViewportClass: {
  [key: string]: ViewportConstructor;
} = {
  [ViewportType.ORTHOGRAPHIC]: VolumeViewport,
  [ViewportType.PERSPECTIVE]: VolumeViewport,
  [ViewportType.STACK]: StackViewport,
  [ViewportType.VOLUME_3D]: VolumeViewport3D,
  [ViewportType.WHOLE_SLIDE]: WSIViewport,
  [ViewportType.ECG]: ECGViewport,
  [ViewportType.VIDEO]: VideoViewport,
  // v2 viewports below
  [ViewportType.VOLUME_3D_V2]: VolumeViewport3DV2, // v2
  [ViewportType.PLANAR_V2]: PlanarViewport, // v2
  [ViewportType.VIDEO_V2]: VideoViewportNext, // v2
  [ViewportType.ECG_V2]: ECGViewportNext, // v2
  [ViewportType.WHOLE_SLIDE_V2]:
    WSIViewportNext as unknown as ViewportConstructor, // v2
};

export default viewportTypeToViewportClass;
