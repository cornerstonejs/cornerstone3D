type StorageTexture = { isInitializing?: () => boolean };

/**
 * The actors whose last render skipped the draw, each with the textures it
 * waits on, because the browser still clears their new storage (see
 * `isInitializing` of `vtkStreamingOpenGLTexture`). The streaming mappers keep
 * this map, and a rendering engine fires no `IMAGE_RENDERED` for a viewport
 * that holds such an actor. The texture renders the viewport again when the
 * storage is ready, and that render fires the event, so a listener never sees
 * the empty frame.
 */
const actorsWaitingForStorage = new WeakMap<object, StorageTexture[]>();

/** Whether this actor skipped its draw and its storage is still not ready. */
export function isWaitingForStorage(actor: object): boolean {
  return !!actorsWaitingForStorage
    .get(actor)
    ?.some((texture) => texture?.isInitializing?.());
}

export default actorsWaitingForStorage;
