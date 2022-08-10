import { Enums, Types } from '@cornerstonejs/core';
import triggerAnnotationRender from '../utilities/triggerAnnotationRender';

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
const onImageRendered = function (evt: Types.EventTypes.ImageRenderedEvent) {
  // TODO: should we do this on camera modified instead of image rendered?
  // e.g. no need to re-render annotations if only the VOI has changed
  triggerAnnotationRender(evt.detail.element);
};

const enable = function (element: HTMLDivElement): void {
  element.addEventListener(
    Enums.Events.IMAGE_RENDERED,
    onImageRendered as EventListener
  );
};

const disable = function (element: HTMLDivElement): void {
  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    onImageRendered as EventListener
  );
};

export default {
  enable,
  disable,
};
