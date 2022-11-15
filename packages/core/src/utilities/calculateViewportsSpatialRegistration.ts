import { vec3, mat4 } from 'gl-matrix';
import { IStackViewport } from '../types';
import { StackViewport } from '../RenderingEngine';
import spatialRegistrationMetadataProvider from './spatialRegistrationMetadataProvider';
import { metaData } from '..';
import isEqual from './isEqual';

/**
 * It calculates the registration matrix between two viewports (currently only
 * translation is supported)
 * If the viewports are in the same frame of reference, it will return early,
 * but otherwise it will use the current image's metadata to calculate the
 * translation between the two viewports and adds it to the spatialRegistrationModule
 * metadata provider
 *
 *
 * @param viewport1 - The first stack viewport
 * @param viewport2 - The second stack viewport
 */
function calculateViewportsSpatialRegistration(
  viewport1: IStackViewport,
  viewport2: IStackViewport
): void {
  if (
    !(viewport1 instanceof StackViewport) ||
    !(viewport2 instanceof StackViewport)
  ) {
    throw new Error(
      'calculateViewportsSpatialRegistration: Both viewports must be StackViewports, volume viewports are not supported yet'
    );
  }

  const isSameFrameOfReference =
    viewport1.getFrameOfReferenceUID() === viewport2.getFrameOfReferenceUID();

  if (isSameFrameOfReference) {
    return;
  }

  const imageId1 = viewport1.getCurrentImageId();
  const imageId2 = viewport2.getCurrentImageId();

  const imagePlaneModule1 = metaData.get('imagePlaneModule', imageId1);
  const imagePlaneModule2 = metaData.get('imagePlaneModule', imageId2);

  const isSameImagePlane =
    imagePlaneModule1 &&
    imagePlaneModule2 &&
    isEqual(
      imagePlaneModule1.imageOrientationPatient,
      imagePlaneModule2.imageOrientationPatient
    );

  if (!isSameImagePlane) {
    throw new Error(
      'Viewport spatial registration only supported for same orientation (hence translation only) for now'
    );
  }

  const imagePositionPatient1 = imagePlaneModule1.imagePositionPatient;
  const imagePositionPatient2 = imagePlaneModule2.imagePositionPatient;

  const translation = vec3.subtract(
    vec3.create(),
    imagePositionPatient1,
    imagePositionPatient2
  );

  const mat = mat4.fromTranslation(mat4.create(), translation);

  spatialRegistrationMetadataProvider.add([viewport1.id, viewport2.id], mat);
}

export default calculateViewportsSpatialRegistration;
