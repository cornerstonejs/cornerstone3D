import type PlanarViewport from '../RenderingEngine/Viewports/Planar/PlanarViewport';
import {
  getSliceViewGeometry,
  type SliceViewInfo,
} from './getVolumeSliceViewInfo';

/**
 * The slice view info of a viewport that shows a stack, in the conventions
 * of `getVolumeSliceViewInfo`: the size and the matrices of the image on
 * display come from the public transforms and the image data of the
 * viewport. The slice index is the index of the image in the stack. The
 * slice plane is 2, the plane of the image, and the image data of a stack
 * holds that one image, at index 0 along its third axis.
 */
export function getStackSliceViewInfo(viewport: PlanarViewport): SliceViewInfo {
  return {
    sliceIndex: viewport.getCurrentImageIdIndex(),
    slicePlane: 2,
    ...getSliceViewGeometry(viewport),
  };
}
