import { BaseVolumeViewport, type Types } from '@cornerstonejs/core';
import {
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import { SegmentationRepresentations } from '../../enums';
import getViewportLabelmapRenderMode from '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  getVolumeViewportLabelmapImageMapperState,
  shouldUseSliceRendering,
} from '../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { syncStackLabelmapActors } from '../../tools/displayTools/Labelmap/syncStackLabelmapActors';

const enable = function (element: HTMLDivElement): void {
  if (!element) {
    return;
  }

  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;
  const isVolumeViewport = viewport instanceof BaseVolumeViewport;
  const canUseStackImageEvents =
    typeof (viewport as { getCurrentImageId?: () => string })
      .getCurrentImageId === 'function';

  if (isVolumeViewport) {
    element.addEventListener(
      Enums.Events.CAMERA_MODIFIED,
      _imageChangeEventListener as EventListener
    );
  }

  if (
    isVolumeViewport ||
    !canUseStackImageEvents ||
    getViewportLabelmapRenderMode(viewport) !== 'image'
  ) {
    return;
  }

  element.addEventListener(
    Enums.Events.PRE_STACK_NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  // this listener handles the segmentation modifications
  // we only listen to the image_rendered once and then remove it
  // the main event to listen here is the stack_new_image
  element.addEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
};

const disable = function (element: HTMLDivElement): void {
  const viewportId = getEnabledElement(element)?.viewport?.id;

  element.removeEventListener(
    Enums.Events.PRE_STACK_NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.CAMERA_MODIFIED,
    _imageChangeEventListener as EventListener
  );

  if (viewportId) {
    perViewportManualTriggers.delete(viewportId);
  }
};

const perViewportManualTriggers = new Map();

/**
 *  When the image is rendered, check what tools can be rendered for this element.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `renderAnnotation` method, then we render them.
 * - Note that these tools don't necessarily have to be instances of  `AnnotationTool`,
 *   Any tool may register a `renderAnnotation` method (e.g. a tool that displays an overlay).
 *
 * @param evt - The normalized IMAGE_RENDERED event.
 */
function _imageChangeEventListener(evt) {
  const eventData = evt.detail;
  const { viewportId, renderingEngineId } = eventData;
  const enabledElement = getEnabledElementByIds(
    viewportId,
    renderingEngineId
  ) as { viewport: Types.IStackViewport } | undefined;

  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;
  const isVolumeViewport = viewport instanceof BaseVolumeViewport;
  const representations = getSegmentationRepresentations(viewportId);

  if (!representations?.length) {
    perViewportManualTriggers.delete(viewportId);
    return;
  }

  const labelmapRepresentations = representations.filter(
    (representation) =>
      representation.type === SegmentationRepresentations.Labelmap
  );

  const hasVolumeImageMapperRepresentation = labelmapRepresentations.some(
    (representation) => {
      const segmentation = getSegmentation(representation.segmentationId);

      return (
        isVolumeViewport &&
        shouldUseSliceRendering(
          segmentation,
          (
            representation as {
              config?: { useSliceRendering?: boolean };
            }
          ).config
        )
      );
    }
  );

  if (evt.type === Enums.Events.CAMERA_MODIFIED) {
    if (!hasVolumeImageMapperRepresentation) {
      perViewportManualTriggers.delete(viewportId);
      return;
    }

    const nextState = getVolumeViewportLabelmapImageMapperState(viewport);
    const previousState = perViewportManualTriggers.get(viewportId);

    if (previousState === nextState.key) {
      return;
    }

    perViewportManualTriggers.set(viewportId, nextState.key);
    triggerSegmentationRender(viewportId);
    return;
  }

  if (getViewportLabelmapRenderMode(viewport) !== 'image') {
    return;
  }

  if (isVolumeViewport) {
    return;
  }

  if (
    typeof (viewport as { getCurrentImageId?: () => string })
      .getCurrentImageId !== 'function'
  ) {
    return;
  }

  labelmapRepresentations.forEach((representation) => {
    const { segmentationId } = representation;
    syncStackLabelmapActors(viewport, segmentationId);

    // if one or more actors were added to the viewport
    // we need to trigger a segmentation render
    // This is put here to make sure that the segmentation is rendered
    // for the initial image as well after that we don't need it since
    // stack new image is called when changing slices
    if (evt.type === Enums.Events.IMAGE_RENDERED) {
      // unsubscribe after the initial render
      viewport.element.removeEventListener(
        Enums.Events.IMAGE_RENDERED,
        _imageChangeEventListener as EventListener
      );
    }
  });
}

export default {
  enable,
  disable,
};
