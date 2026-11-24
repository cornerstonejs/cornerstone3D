import type { ScrollOptions, IViewport } from '../types';
import scrollViewport from '../RenderingEngine/Viewports/viewportScroll';
import getEnabledElement from '../getEnabledElement';
import {
  getViewportContentMode,
  viewportIsInStackMode,
} from './viewportCapabilities';

/**
 * A viewport that scrolls through the images of a list of image ids: a
 * planar, video or ECG viewport.
 */
type ImageScrollViewport = IViewport & {
  getImageIds(): string[];
  getCurrentImageIdIndex(): number;
  scroll(delta: number, ...args: unknown[]): unknown;
};

/**
 * Scrolls a viewport by `options.delta` steps, with the scroll that
 * `scroll()` of a planar and of a video viewport has (see
 * `scrollViewport`): the same request gives the same position and the same
 * event by either.
 *
 * - `delta` is a number of steps: an image of a stack, a slice of a volume
 *   along the view in any orientation, or the `scrollStep` of a video.
 * - `loop` wraps at both ends instead of stopping there.
 * - `scrollSlabs` makes a step the slab thickness of the source in volume
 *   mode. A stack has no slab: a step stays one image.
 * - `volumeId` names another volume of the viewport whose spacing along the
 *   view gives the step in volume mode.
 * - `debounceLoading` is passed to a registered viewport that scrolls
 *   itself. A planar and a video viewport have no debounce.
 *
 * A scroll without `loop` that stops at the first or the last position fires
 * SCROLL_OUT_OF_BOUNDS on the element of the viewport and on the
 * eventTarget. An ECG viewport scrolls in time and has no such end. A
 * viewport that has no index to scroll, as a 3D or a whole slide viewport,
 * is left as it is.
 *
 * @param viewport - The viewport in which to scroll
 * @param options - Options to use for scrolling, including direction, invert, and volumeId
 */
export default function scroll(
  viewport: IViewport,
  options: ScrollOptions
): void {
  const enabledElement = getEnabledElement(viewport.element);

  if (!enabledElement) {
    throw new Error('Scroll::Viewport is not enabled (it might be disabled)');
  }

  if (
    viewportIsInStackMode(viewport) &&
    (viewport as ImageScrollViewport).getImageIds().length === 0
  ) {
    throw new Error('Scroll::Stack Viewport has no images');
  }

  if (getViewportContentMode(viewport) === 'ecg') {
    (viewport as ImageScrollViewport).scroll(options.delta);
    return;
  }

  if (
    typeof (viewport as ImageScrollViewport).getCurrentImageIdIndex !==
      'function' ||
    typeof (viewport as ImageScrollViewport).scroll !== 'function'
  ) {
    return;
  }

  scrollViewport(viewport, options);
}
