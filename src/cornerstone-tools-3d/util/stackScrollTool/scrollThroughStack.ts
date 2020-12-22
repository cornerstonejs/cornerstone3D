import { getEnabledElement } from '../../../index';
import getTargetVolume from '../planar/getTargetVolume';
import getSliceRange from './getSliceRange';
import snapFocalPointToSlice from './snapFocalPointToSlice';

export default function scrollThroughStack(evt, deltaFrames, volumeUID) {
  const { element: canvas } = evt.detail;
  const enabledElement = getEnabledElement(canvas);
  const { scene, viewport } = enabledElement;
  const camera = viewport.getCamera();
  const { focalPoint, viewPlaneNormal, position } = camera;

  // Stack scroll across highest resolution volume.
  const { spacingInNormalDirection, imageVolume } = getTargetVolume(
    scene,
    camera,
    volumeUID
  );

  const volumeActor = scene.getVolumeActor(imageVolume.uid);
  const scrollRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint);

  const { newFocalPoint, newPosition } = snapFocalPointToSlice(
    focalPoint,
    position,
    scrollRange,
    viewPlaneNormal,
    spacingInNormalDirection,
    deltaFrames
  );

  enabledElement.viewport.setCamera({
    focalPoint: newFocalPoint,
    position: newPosition,
  });
  enabledElement.viewport.render();
}
