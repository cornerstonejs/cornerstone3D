import { vec3, mat4 } from 'gl-matrix';
import type PlanarViewport from '../RenderingEngine/GenericViewport/Planar/PlanarViewport';
import type { ImagePlaneModule } from '../types';
import {
  addCalculatedRegistration,
  type CalculatedRegistrationViewport,
} from './spatialRegistrationMetadataProvider';
import { get } from '../metaData';
import { coreLog } from './logger';

const log = coreLog.getLogger(
  'utilities',
  'calculateViewportsSpatialRegistration'
);

/**
 * Defines the allowed difference as a percent between the unit normals before
 * two planes are considered not coplanar.  Since this value is small compared
 * to the unit lenght, this value is approximately the angular difference, measured
 * in radians.  That is, allow about a 3 degrees variation.
 */
const ALLOWED_DELTA = 0.05;

/**
 * Whether a value is an array or a typed array that starts with `length`
 * finite numbers.
 */
function isFiniteList(
  value: unknown,
  length: number
): value is ArrayLike<number> {
  const list = value as ArrayLike<number> | undefined;

  return (
    typeof list?.length === 'number' &&
    list.length >= length &&
    Array.from(list).slice(0, length).every(Number.isFinite)
  );
}

/**
 * The orientation of an image plane module as the six numbers of the image
 * orientation: `imageOrientationPatient`, else the row cosines followed by
 * the column cosines, which a metadata provider may give in its place.
 * Undefined when neither is there.
 */
function getImageOrientation(
  imagePlaneModule: ImagePlaneModule
): number[] | undefined {
  const { imageOrientationPatient, rowCosines, columnCosines } =
    imagePlaneModule;

  if (isFiniteList(imageOrientationPatient, 6)) {
    return Array.from(imageOrientationPatient).slice(0, 6);
  }

  if (isFiniteList(rowCosines, 3) && isFiniteList(columnCosines, 3)) {
    return [
      ...Array.from(rowCosines).slice(0, 3),
      ...Array.from(columnCosines).slice(0, 3),
    ];
  }
}

/**
 * It calculates the registration matrix between two viewports (currently only
 * translation is supported)
 * It uses the image plane of the image on display of each viewport
 * (`getCurrentImageId()`), which it takes as the same place in both, to
 * calculate the translation between the two viewports and adds it to the
 * spatialRegistrationModule
 * metadata provider, for the viewport ids and the rendering engine ids of the
 * two viewports. A lookup with other rendering engine ids does not find it; a
 * lookup with the viewport ids alone does, as in 5.x
 *
 * The orientation of an image is its `imageOrientationPatient`, else its
 * `rowCosines` and `columnCosines`. An image without an orientation or a
 * position gives no registration. The registration is for the frames of
 * reference that the viewports show now: once one of them shows another
 * frame of reference, the provider no longer gives it, so the next
 * synchronization works it out again.
 *
 * The current images are the reference, so the user can scroll both viewports
 * to matching anatomy before the registration is calculated.
 *
 * @param viewport1 - The first stack viewport
 * @param viewport2 - The second stack viewport
 */
function calculateViewportsSpatialRegistration(
  viewport1: PlanarViewport,
  viewport2: PlanarViewport
): void {
  const imageId1 = viewport1.getCurrentImageId();
  const imageId2 = viewport2.getCurrentImageId();

  const imagePlaneModule1 = imageId1 && get('imagePlaneModule', imageId1);
  const imagePlaneModule2 = imageId2 && get('imagePlaneModule', imageId2);

  if (!imagePlaneModule1 || !imagePlaneModule2) {
    log.info('Viewport spatial registration requires image plane module');
    return;
  }

  const orientation1 = getImageOrientation(imagePlaneModule1);
  const orientation2 = getImageOrientation(imagePlaneModule2);
  const imagePositionPatient1 = imagePlaneModule1.imagePositionPatient;
  const imagePositionPatient2 = imagePlaneModule2.imagePositionPatient;

  if (
    !orientation1 ||
    !orientation2 ||
    !isFiniteList(imagePositionPatient1, 3) ||
    !isFiniteList(imagePositionPatient2, 3)
  ) {
    log.info(
      'Viewport spatial registration requires the orientation and the position of both images'
    );
    return;
  }

  const isSameImagePlane = orientation1.every(
    (v, i) => Math.abs(v - orientation2[i]) < ALLOWED_DELTA
  );

  if (!isSameImagePlane) {
    log.info(
      'Viewport spatial registration only supported for same orientation (hence translation only) for now',
      orientation1,
      orientation2
    );
    return;
  }

  const translation = vec3.subtract(
    vec3.create(),
    imagePositionPatient1 as unknown as vec3,
    imagePositionPatient2 as unknown as vec3
  );

  addCalculatedRegistration(
    [viewport1, viewport2].map((viewport) => ({
      viewportId: viewport.id,
      renderingEngineId: viewport.renderingEngineId,
      frameOfReferenceUID: viewport.getFrameOfReferenceUID?.(),
    })) as [CalculatedRegistrationViewport, CalculatedRegistrationViewport],
    mat4.fromTranslation(mat4.create(), translation)
  );
}

export default calculateViewportsSpatialRegistration;
