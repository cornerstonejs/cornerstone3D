// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport';
import VolumeViewport from '../VolumeViewport';
import ViewportType from '../../enums/ViewportType';
import VolumeViewport3D from '../VolumeViewport3D';
import VideoViewport from '../VideoViewport';
import WSIViewport from '../WSIViewport';
import ECGViewport from '../ECGViewport';
import ECGViewportV2 from '../ViewportV2/ECG/ECGViewportV2';
import PlanarViewportV2 from '../ViewportV2/Planar/PlanarViewportV2';
import VideoViewportV2 from '../ViewportV2/Video/VideoViewportV2';
import VolumeViewport3DV2 from '../ViewportV2/Volume3D/3dViewport';
import WSIViewportV2 from '../ViewportV2/WSI/WSIViewportV2';
import type { ViewportInput, IViewport } from '../../types/IViewport';

interface ViewportConstructor {
  new (
    viewportInput: ViewportInput
  ):
    | IViewport
    | PlanarViewportV2
    | VideoViewportV2
    | VolumeViewport3DV2
    | ECGViewportV2;
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
  [ViewportType.PLANAR_V2]: PlanarViewportV2, // v2
  [ViewportType.VIDEO_V2]: VideoViewportV2, // v2
  [ViewportType.ECG_V2]: ECGViewportV2, // v2
  [ViewportType.WHOLE_SLIDE_V2]:
    WSIViewportV2 as unknown as ViewportConstructor, // v2
};

export default viewportTypeToViewportClass;
