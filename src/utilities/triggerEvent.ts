/**
 * Small utility to trigger a custom event for a given EventTarget.
 *
 * @param el - The element or EventTarget to trigger the event upon
 * @param type - The event type name
 * @param detail - The event data to be sent
 * @returns false if event is cancelable and at least one of the event handlers
 * which received event called Event.preventDefault(). Otherwise it returns true.
 */
export default function triggerEvent(
  el: EventTarget,
  type: string,
  detail: any = null
): boolean {
  const event = new CustomEvent(type, {
    detail,
    cancelable: true,
  })

  return el.dispatchEvent(event)
}
