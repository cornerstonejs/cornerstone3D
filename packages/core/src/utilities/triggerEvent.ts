import eventTarget from '../eventTarget';

/**
 * Small utility to trigger a custom event for a given EventTarget.
 *
 * @example
 *
 * ```javascript
 * triggerEvent(element, Events.IMAGE_RENDERED, { element })
 * ```
 * or it can trigger event on the eventTarget itself
 *
 * ```javascript
 * triggerEvent(eventTarget, CSTOOLS_EVENTS.ANNOTATION_MODIFIED, { viewportId, annotationUID })
 * ```
 *
 * @param el - The element or EventTarget to trigger the event upon
 * @param type - The event type name
 * @param detail - The event detail to be sent
 * @returns false if event is cancelable and at least one of the event handlers
 * which received event called Event.preventDefault(). Otherwise it returns true.
 */
export default function triggerEvent(
  el: EventTarget = eventTarget,
  type: string,
  detail: unknown = null
): boolean {
  if (!type) {
    throw new Error('Event type was not defined');
  }

  const event = new CustomEvent(type, {
    detail,
    cancelable: true,
  });

  return el.dispatchEvent(event);
}
