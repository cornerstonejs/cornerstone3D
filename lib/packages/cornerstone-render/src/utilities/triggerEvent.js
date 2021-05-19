import eventTarget from '../eventTarget';
/**
 * Small utility to trigger a custom event for a given EventTarget.
 *
 * @param el - The element or EventTarget to trigger the event upon
 * @param type - The event type name
 * @param detail - The event data to be sent
 * @returns false if event is cancelable and at least one of the event handlers
 * which received event called Event.preventDefault(). Otherwise it returns true.
 */
export default function triggerEvent(el = eventTarget, type, detail = null) {
    if (!type) {
        throw new Error('Event type was not defined');
    }
    const event = new CustomEvent(type, {
        detail,
        cancelable: true,
    });
    return el.dispatchEvent(event);
}
//# sourceMappingURL=triggerEvent.js.map