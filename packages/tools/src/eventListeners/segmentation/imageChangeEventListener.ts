import type { Types, PlanarViewport } from '@cornerstonejs/core';
import {
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import { SegmentationRepresentations } from '../../enums';
import getViewportLabelmapRenderMode from '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  canRenderVolumeViewportLabelmapAsImage,
  getVolumeViewportLabelmapImageMapperState,
  shouldUseSliceRendering,
} from '../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { syncStackLabelmapActors } from '../../tools/displayTools/Labelmap/syncStackLabelmapActors';
import { placeVolumeLabelmapImageMapperActors } from '../../tools/displayTools/Labelmap/volumeLabelmapImageMapper';

const enable = function (element: HTMLDivElement): void {
  if (!element) {
    return;
  }

  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;
  const isPlanarViewport = viewport.type === Enums.ViewportType.PLANAR;
  const canUseStackImageEvents =
    typeof (viewport as { getCurrentImageId?: () => string })
      .getCurrentImageId === 'function';

  if (isPlanarViewport) {
    element.addEventListener(
      Enums.Events.CAMERA_MODIFIED,
      _imageChangeEventListener as EventListener
    );
    element.addEventListener(
      Enums.Events.IMAGE_RENDERED,
      _labelmapImageMapperSupportListener as EventListener
    );
  }

  if (
    !canUseStackImageEvents ||
    getViewportLabelmapRenderMode(viewport) !== 'image'
  ) {
    return;
  }

  if (viewport.type === Enums.ViewportType.VIDEO) {
    element.addEventListener(
      Enums.Events.NEW_IMAGE,
      _imageChangeEventListener as EventListener
    );
  }

  // this listener handles the segmentation modifications
  // we only listen to the image_rendered once and then remove it
  // the main event to listen here is the camera_modified of a planar viewport
  element.addEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
};

const disable = function (element: HTMLDivElement): void {
  const viewportId = getEnabledElement(element)?.viewport?.id;

  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.CAMERA_MODIFIED,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    _labelmapImageMapperSupportListener as EventListener
  );

  if (viewportId) {
    perViewportManualTriggers.delete(viewportId);
    perViewportImageMapperSupport.delete(viewportId);
  }
};

const perViewportManualTriggers = new Map();
const perViewportImageMapperSupport = new Map<string, boolean>();

/**
 * Renders the labelmaps of a planar next viewport again when the viewport
 * starts or stops being able to draw them as labelmap slice images, so that
 * the labelmap plan is chosen again. A slab change made through the
 * presentation of a display set fires no camera event, and it fires no
 * rendering pipeline event while the source stays on its render path (a
 * sampled slice with a thin slab, or the GPU volume slice path), so this
 * runs after each render of the viewport and costs one check of the
 * viewport state.
 */
function _labelmapImageMapperSupportListener(evt) {
  const { viewportId, renderingEngineId } = evt.detail;
  const viewport = getEnabledElementByIds(viewportId, renderingEngineId)
    ?.viewport as Types.IViewport | undefined;

  if (!viewport) {
    return;
  }

  const supported = canRenderVolumeViewportLabelmapAsImage(viewport);
  const previousSupported = perViewportImageMapperSupport.get(viewportId);

  perViewportImageMapperSupport.set(viewportId, supported);

  if (previousSupported === undefined || previousSupported === supported) {
    return;
  }

  const hasLabelmapRepresentation = getSegmentationRepresentations(
    viewportId
  )?.some(
    (representation) =>
      representation.type === SegmentationRepresentations.Labelmap
  );

  if (!hasLabelmapRepresentation) {
    return;
  }

  perViewportManualTriggers.delete(viewportId);
  triggerSegmentationRender(viewportId);
}

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
  ) as { viewport: Types.IViewport } | undefined;

  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;
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
        canRenderVolumeViewportLabelmapAsImage(viewport) &&
        shouldUseSliceRendering(
          segmentation,
          (
            representation as {
              config?: { useSliceRendering?: boolean };
            }
          ).config,
          viewport
        )
      );
    }
  );

  if (evt.type === Enums.Events.CAMERA_MODIFIED) {
    if (hasVolumeImageMapperRepresentation) {
      labelmapRepresentations.forEach(({ segmentationId }) => {
        placeVolumeLabelmapImageMapperActors({ viewport, segmentationId });
      });

      const nextState = getVolumeViewportLabelmapImageMapperState(viewport);
      const previousState = perViewportManualTriggers.get(viewportId);

      if (previousState === nextState.key) {
        return;
      }

      perViewportManualTriggers.set(viewportId, nextState.key);
      triggerSegmentationRender(viewportId);
      return;
    }

    // A planar viewport fires CAMERA_MODIFIED when it scrolls, so the stack
    // labelmap is synced here.
    const isPlanar = viewport.type === Enums.ViewportType.PLANAR;
    if (!isPlanar) {
      perViewportManualTriggers.delete(viewportId);
      return;
    }

    // Fall through to the stack labelmap sync below.
  }

  if (getViewportLabelmapRenderMode(viewport) !== 'image') {
    return;
  }

  if (canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  if (
    typeof (viewport as { getCurrentImageId?: () => string })
      .getCurrentImageId !== 'function'
  ) {
    return;
  }

  const stackViewport = viewport as Types.IViewport & {
    element: HTMLDivElement;
  };

  labelmapRepresentations.forEach((representation) => {
    const { segmentationId } = representation;

    // if one or more actors were added to the viewport
    // we need to trigger a segmentation render
    // This is put here to make sure that the segmentation is rendered
    // for the initial image as well after that we don't need it since
    // camera modified is called when changing slices
    if (evt.type === Enums.Events.IMAGE_RENDERED) {
      // unsubscribe after the initial render, and before the sync below:
      // the sync renders the viewport, and a CPU render path draws
      // synchronously and fires IMAGE_RENDERED again inside that call,
      // which would re-enter this listener until the stack overflows
      stackViewport.element.removeEventListener(
        Enums.Events.IMAGE_RENDERED,
        _imageChangeEventListener as EventListener
      );
    }

    syncStackLabelmapActors(stackViewport as PlanarViewport, segmentationId);
  });
}

export default {
  enable,
  disable,
};
