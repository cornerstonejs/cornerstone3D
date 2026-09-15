import { MouseBindings } from '../../enums';

/**
 * Synthesizes the mouse-detail fields a mouse callback may read but which
 * the normalized touch event details lack (additive only - existing touch
 * fields are never overwritten).
 */
function augmentTouchDetailForMouseCallback(detail) {
  detail.mouseButton ??= MouseBindings.Primary;
  detail.startPoints ??= detail.currentPoints;
  detail.lastPoints ??= detail.currentPoints;
  detail.deltaPoints ??= {
    page: [0, 0],
    client: [0, 0],
    canvas: [0, 0],
    world: [0, 0, 0],
  };
}

/**
 * Resolves the callback a touch dispatcher should invoke on a tool:
 * - the explicit touch callback when the tool implements it (always wins,
 *   regardless of supportedInteractionTypes), otherwise
 * - the mouse counterpart, but only when the tool declares 'Touch' in its
 *   supportedInteractionTypes.
 *
 * Returns undefined when the tool has neither (or the mouse counterpart is
 * not enabled for touch), so callers can skip the tool.
 */
export default function getTouchCallbackWithMouseFallback(
  tool,
  touchCallbackName: string,
  mouseCallbackName: string
): ((evt) => unknown) | undefined {
  if (typeof tool?.[touchCallbackName] === 'function') {
    return (evt) => tool[touchCallbackName](evt);
  }

  if (
    tool?.supportedInteractionTypes?.includes('Touch') &&
    typeof tool[mouseCallbackName] === 'function'
  ) {
    return (evt) => {
      augmentTouchDetailForMouseCallback(evt.detail);
      return tool[mouseCallbackName](evt);
    };
  }
}
