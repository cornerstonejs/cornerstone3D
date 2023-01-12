import { vec3 } from 'gl-matrix';
import {
  getRenderingEngine,
  Types,
  metaData,
  utilities,
} from '@cornerstonejs/core';
import { Synchronizer } from '../../store';
import { jumpToSlice } from '../../utilities';
import areViewportsCoplanar from './areViewportsCoplanar ';
/**
 * Synchronizer callback to synchronize the source viewport image to the
 * target viewports closest image in its stack. There are two scenarios
 *
 * 1) viewports are in the same frameOfReferenceUID then we can use the
 * absolute imagePositionPatient for the source viewport's current image
 * and set the target viewport's image to the closest image in its stack
 * (which might have different slice thickness so cannot use slice number)
 *
 * 2) viewports have different frameOfReferenceUIDs then we look inside the
 * registrationMetadataProvider to check if there is a corresponding matrix
 * for mapping between the source and target viewport if so it is used to
 * and is applied to the imagePositionPatient of the source viewport's to
 * get the imagePositionPatient of the target viewport's closest image in
 * its stack.
 * Note for 2) The consuming apps using Cornerstone3D (OHIF, etc) are responsible
 * to provide such data in the registrationMetadataProvider. This can be done
 * by various methods 1) Using spatialRegistrationModule inside dicom 2) assuming
 * the user has actually manually scrolled the target viewport to the correct
 * slice before initiating the synchronization 3) using some other method
 * But overall, the consuming app is responsible for providing the data.
 *
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, never
 *   the same as sourceViewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default async function stackImageSyncCallback(
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

  const sViewport = renderingEngine.getViewport(
    sourceViewport.viewportId
  ) as Types.IStackViewport;

  const tViewport = renderingEngine.getViewport(
    targetViewport.viewportId
  ) as Types.IStackViewport;

  const frameOfReferenceUID1 = sViewport.getFrameOfReferenceUID();
  const frameOfReferenceUID2 = tViewport.getFrameOfReferenceUID();

  const imageId1 = sViewport.getCurrentImageId();
  const imagePlaneModule1 = metaData.get('imagePlaneModule', imageId1);
  const sourceImagePositionPatient = imagePlaneModule1.imagePositionPatient;

  const targetImageIds = tViewport.getImageIds();

  if (!areViewportsCoplanar(sViewport, tViewport)) {
    return;
  }

  if (frameOfReferenceUID1 === frameOfReferenceUID2) {
    // if frames of references are the same we can use the absolute
    // imagePositionPatient to find the closest image in the target viewport's stack
    const closestImageIdIndex = _getClosestImageIdIndex(
      sourceImagePositionPatient,
      targetImageIds
    );

    if (
      closestImageIdIndex.index !== -1 &&
      tViewport.getCurrentImageIdIndex() !== closestImageIdIndex.index
    ) {
      // await tViewport.setImageIdIndex(closestImageIdIndex.index);
      await jumpToSlice(tViewport.element, {
        imageIndex: closestImageIdIndex.index,
      });

      return;
    }
  } else {
    // if the frame of reference is different we need to use the registrationMetadataProvider
    // and add that to the imagePositionPatient of the source viewport to get the
    // imagePositionPatient of the target viewport's closest image in its stack
    const registrationMatrixMat4 =
      utilities.spatialRegistrationMetadataProvider.get(
        'spatialRegistrationModule',
        [targetViewport.viewportId, sourceViewport.viewportId]
      );

    if (!registrationMatrixMat4) {
      throw new Error(
        `No registration matrix found for sourceViewport: ${sourceViewport.viewportId} and targetViewport: ${targetViewport.viewportId}, viewports with different frameOfReferenceUIDs must have a registration matrix in the registrationMetadataProvider. Use calculateViewportsRegistrationMatrix to calculate the matrix.`
      );
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

    if (
      closestImageIdIndex2.index !== -1 &&
      tViewport.getCurrentImageIdIndex() !== closestImageIdIndex2.index
    ) {
      await jumpToSlice(tViewport.element, {
        imageIndex: closestImageIdIndex2.index,
      });
    }
  }
}

function _getClosestImageIdIndex(targetPoint, imageIds) {
  // todo: this does not assume orientation yet, but that can be added later
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
