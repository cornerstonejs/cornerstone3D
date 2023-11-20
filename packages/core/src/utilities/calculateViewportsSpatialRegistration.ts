import { vec3, mat4 } from 'gl-matrix';
import { IStackViewport, IVolumeViewport } from '../types';
import spatialRegistrationMetadataProvider from './spatialRegistrationMetadataProvider';
import { metaData } from '..';

/**
 * Defines the allowed difference as a percent between the unit normals before
 * two planes are considered not coplanar.  Since this value is small compared
 * to the unit lenght, this value is approximately the angular difference, measured
 * in radians.  That is, allow about a 3 degrees variation.
 */
const ALLOWED_DELTA = 0.05;

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
  viewport1: IStackViewport | IVolumeViewport,
  viewport2: IStackViewport | IVolumeViewport
): void {
  const imageId1 = viewport1.getCurrentImageId();
  const imageId2 = viewport2.getCurrentImageId();

  const imagePlaneModule1 = metaData.get('imagePlaneModule', imageId1);
  const imagePlaneModule2 = metaData.get('imagePlaneModule', imageId2);

  if (!imagePlaneModule1 || !imagePlaneModule2) {
    console.log('Viewport spatial registration requires image plane module');
    return;
  }
  const { imageOrientationPatient: iop2 } = imagePlaneModule2;
  const isSameImagePlane = imagePlaneModule1.imageOrientationPatient.every(
    (v, i) => Math.abs(v - iop2[i]) < ALLOWED_DELTA
  );

  if (!isSameImagePlane) {
    console.log(
      'Viewport spatial registration only supported for same orientation (hence translation only) for now',
      imagePlaneModule1?.imageOrientationPatient,
      imagePlaneModule2?.imageOrientationPatient
    );
    return;
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
