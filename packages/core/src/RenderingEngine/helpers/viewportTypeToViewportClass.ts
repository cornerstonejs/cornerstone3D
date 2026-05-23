// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport';
import VolumeViewport from '../VolumeViewport';
import ViewportType from '../../enums/ViewportType';
import VolumeViewport3D from '../VolumeViewport3D';
import VideoViewport from '../VideoViewport';
import WSIViewport from '../WSIViewport';
import LegacyECGViewport from '../ECGViewport';
import ECGViewport from '../GenericViewport/ECG/ECGViewport';
import PlanarViewport from '../GenericViewport/Planar/PlanarViewport';
import PlanarViewportLegacyAdapter from '../GenericViewport/Planar/PlanarViewportLegacyAdapter';
import NextVideoViewport from '../GenericViewport/Video/VideoViewport';
import VideoViewportLegacyAdapter from '../GenericViewport/Video/VideoViewportLegacyAdapter';
import VolumeViewport3DV2 from '../GenericViewport/Volume3D/viewport3D';
import VolumeViewport3DLegacyAdapter from '../GenericViewport/Volume3D/VolumeViewport3DLegacyAdapter';
import NextWSIViewport from '../GenericViewport/WSI/WSIViewport';
import WSIViewportLegacyAdapter from '../GenericViewport/WSI/WSIViewportLegacyAdapter';
import ECGViewportLegacyAdapter from '../GenericViewport/ECG/ECGViewportLegacyAdapter';
import type {
  ViewportInput,
  IViewport,
  InternalViewportInput,
  NormalizedViewportInput,
} from '../../types/IViewport';

interface ViewportConstructor {
  new (
    viewportInput: ViewportInput
  ):
    | IViewport
    | PlanarViewport
    | NextVideoViewport
    | VolumeViewport3DV2
    | ECGViewport;
}

const viewportTypeToViewportClass: {
  [key: string]: ViewportConstructor;
} = {
  [ViewportType.ORTHOGRAPHIC]: VolumeViewport,
  [ViewportType.PERSPECTIVE]: VolumeViewport,
  [ViewportType.STACK]: StackViewport,
  [ViewportType.VOLUME_3D]: VolumeViewport3D,
  [ViewportType.WHOLE_SLIDE]: WSIViewport,
  [ViewportType.ECG]: LegacyECGViewport,
  [ViewportType.VIDEO]: VideoViewport,
  // next viewports below
  [ViewportType.VOLUME_3D_NEXT]: VolumeViewport3DV2, // next
  [ViewportType.PLANAR_NEXT]: PlanarViewport, // next
  [ViewportType.VIDEO_NEXT]: NextVideoViewport, // next
  [ViewportType.ECG_NEXT]: ECGViewport, // next
  [ViewportType.WHOLE_SLIDE_NEXT]:
    NextWSIViewport as unknown as ViewportConstructor, // next
};

export default viewportTypeToViewportClass;

type ViewportClassInput = Pick<
  ViewportInput | InternalViewportInput | NormalizedViewportInput,
  'type' | 'requestedType'
>;

export function getViewportClassForInput({
  type,
  requestedType,
}: ViewportClassInput): ViewportConstructor {
  if (
    type === ViewportType.PLANAR_NEXT &&
    (requestedType === ViewportType.STACK ||
      requestedType === ViewportType.ORTHOGRAPHIC)
  ) {
    return PlanarViewportLegacyAdapter as unknown as ViewportConstructor;
  }

  if (
    type === ViewportType.VIDEO_NEXT &&
    requestedType === ViewportType.VIDEO
  ) {
    return VideoViewportLegacyAdapter as unknown as ViewportConstructor;
  }

  if (type === ViewportType.ECG_NEXT && requestedType === ViewportType.ECG) {
    return ECGViewportLegacyAdapter as unknown as ViewportConstructor;
  }

  if (
    type === ViewportType.WHOLE_SLIDE_NEXT &&
    requestedType === ViewportType.WHOLE_SLIDE
  ) {
    return WSIViewportLegacyAdapter as unknown as ViewportConstructor;
  }

  if (
    type === ViewportType.VOLUME_3D_NEXT &&
    requestedType === ViewportType.VOLUME_3D
  ) {
    return VolumeViewport3DLegacyAdapter as unknown as ViewportConstructor;
  }

  return viewportTypeToViewportClass[type];
}
