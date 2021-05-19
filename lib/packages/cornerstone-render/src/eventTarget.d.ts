/**
 * EventTarget - Provides the [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) interface
 */
declare class CornerstoneEventTarget implements EventTarget {
    private listeners;
    constructor();
    addEventListener(type: any, callback: any): void;
    removeEventListener(type: any, callback: any): void;
    dispatchEvent(event: any): boolean;
}
declare const eventTarget: CornerstoneEventTarget;
export default eventTarget;
