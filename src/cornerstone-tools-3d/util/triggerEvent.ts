/**
 * Triggers a CustomEvent on a target element. Not IE11 compatible.
 *
 * @public
 * @method triggerEvent
 *
 * @param eventTarget   The element or EventTarget to trigger the event on
 * @param eventName     The event's name
 * @param eventData     The event's data
 * @returns {Boolean} The return value is false if at least one event listener called preventDefault(). Otherwise it returns true.
 */
export default function triggerEvent(
  eventTarget: EventTarget,
  eventName: string,
  eventData = {}
): Boolean {
  const event = new CustomEvent(eventName, {
    detail: eventData,
    cancelable: true,
  });

  // console.warn(`Dispatching Event: ${eventName}`, eventData);
  return eventTarget.dispatchEvent(event);
}
