/**
 * The time of the last skipped draw of each actor, because the browser still
 * clears the new storage of its texture (see `isInitializing` of
 * `vtkStreamingOpenGLTexture`). The streaming mappers record the skip, and
 * remove the record when they draw the actor. A rendering engine fires no
 * `IMAGE_RENDERED` for a viewport with an actor that skipped its draw in the
 * render that just ran. The texture renders the viewport again when the storage
 * is ready, and that render fires the event, so a listener never sees the empty
 * frame.
 *
 * The record holds the skip itself, not the state of the fence, so a fence that
 * signals between the skipped draw and the event check cannot let the empty
 * frame through. The time limits the record to one render, so an actor that
 * stops rendering cannot hold back the events of its viewport.
 */
const actorsWaitingForStorage = new WeakMap<object, number>();

/** Whether this actor skipped its draw at or after `since` (`performance.now()`). */
export function skippedDrawSince(actor: object, since: number): boolean {
  return (actorsWaitingForStorage.get(actor) ?? -Infinity) >= since;
}

export default actorsWaitingForStorage;
