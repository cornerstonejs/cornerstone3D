import { vec3, mat4 } from 'gl-matrix';
import {
  getRenderingEngine,
  Types,
  metaData,
  utilities,
  VolumeViewport,
} from '@cornerstonejs/core';
import { Synchronizer } from '../../store';
import { jumpToSlice } from '../../utilities';
import areViewportsCoplanar from './areViewportsCoplanar ';

const getSpatialRegistration = (targetId, sourceId) =>
  utilities.spatialRegistrationMetadataProvider.get(
    'spatialRegistrationModule',
    targetId,
    sourceId
  );

/**
 * Synchronizer callback to synchronize the source viewport image to the
 * target viewports closest image in its stack.
 *
 * This synchronizer does a setup (which can already be predefined as required)
 * to register the target and soruce viewports.  The registration will default
 * to the identity registration if the same FOR is present in both viewports,
 * unless the option `useInitialPosition` is set in the target viewport.
 *
 * The consuming apps using Cornerstone3D (OHIF, etc) MAY provide such data in
 * the registrationMetadataProvider to override the data here. This can be done
 * by various methods 1) Using spatialRegistrationModule inside dicom 2) assuming
 * the user has actually manually scrolled the target viewport to the correct
 * slice before initiating the synchronization 3) using some other method
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, never
 *   the same as sourceViewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default async function imageSliceSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): Promise<void> {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId) as
    | Types.IVolumeViewport
    | Types.IStackViewport;

  const options = synchronizerInstance.getOptions(targetViewport.viewportId);

  if (options?.disabled) {
    return;
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId) as
    | Types.IVolumeViewport
    | Types.IStackViewport;

  const imageId1 = sViewport.getCurrentImageId();
  const imagePlaneModule1 = metaData.get('imagePlaneModule', imageId1);
  const sourceImagePositionPatient = imagePlaneModule1.imagePositionPatient;

  const targetImageIds = tViewport.getImageIds();

  if (!areViewportsCoplanar(sViewport, tViewport)) {
    return;
  }

  // if the frame of reference is different we need to use the registrationMetadataProvider
  // and add that to the imagePositionPatient of the source viewport to get the
  // imagePositionPatient of the target viewport's closest image in its stack
  let registrationMatrixMat4 = getSpatialRegistration(
    targetViewport.viewportId,
    sourceViewport.viewportId
  );

  if (!registrationMatrixMat4) {
    const frameOfReferenceUID1 = sViewport.getFrameOfReferenceUID();
    const frameOfReferenceUID2 = tViewport.getFrameOfReferenceUID();
    if (
      frameOfReferenceUID1 === frameOfReferenceUID2 &&
      options?.useInitialPosition !== false
    ) {
      registrationMatrixMat4 = mat4.identity(mat4.create());
    } else {
      utilities.calculateViewportsSpatialRegistration(sViewport, tViewport);
      registrationMatrixMat4 = getSpatialRegistration(
        targetViewport.viewportId,
        sourceViewport.viewportId
      );
    }
    if (!registrationMatrixMat4) {
      return;
    }
  }

  // apply the registration matrix to the source viewport's imagePositionPatient
  // to get the target viewport's imagePositionPatient
  const targetImagePositionPatientWithRegistrationMatrix = vec3.transformMat4(
    vec3.create(),
    sourceImagePositionPatient,
    registrationMatrixMat4
  );

  // find the closest image in the target viewport's stack to the
  // targetImagePositionPatientWithRegistrationMatrix
  const closestImageIdIndex2 = _getClosestImageIdIndex(
    targetImagePositionPatientWithRegistrationMatrix,
    targetImageIds
  );

  let imageIndexToSet = closestImageIdIndex2.index;
  if (tViewport instanceof VolumeViewport) {
    // since in case of volume viewport our stack is reversed, we should
    // reverse the index as well
    imageIndexToSet = targetImageIds.length - closestImageIdIndex2.index - 1;
  }

  if (
    closestImageIdIndex2.index !== -1 &&
    tViewport.getCurrentImageIdIndex() !== closestImageIdIndex2.index
  ) {
    await jumpToSlice(tViewport.element, {
      imageIndex: imageIndexToSet,
    });
  }
}

function _getClosestImageIdIndex(targetPoint, imageIds) {
  // todo: this does not assume orientation yet, but that can be added later
  // todo: handle multiframe images
  return imageIds.reduce(
    (closestImageIdIndex, imageId, index) => {
      const { imagePositionPatient } = metaData.get(
        'imagePlaneModule',
        imageId
      );
      const distance = vec3.distance(imagePositionPatient, targetPoint);

      if (distance < closestImageIdIndex.distance) {
        return {
          distance,
          index,
        };
      }
      return closestImageIdIndex;
    },
    {
      distance: Infinity,
      index: -1,
    }
  );
}
