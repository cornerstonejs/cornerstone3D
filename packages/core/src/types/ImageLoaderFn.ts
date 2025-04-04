/**
 * Any imageLoader function should implement a loading given the imageId
 * and returns a mandatory promise which will resolve to the loaded image object.
 * Additional `cancelFn` and `decache` can be implemented.
 */
type ImageLoaderFn = (
  imageId: string,
  options?: Record<string, unknown>
) => {
  /** Promise that resolves to the image object */
  promise: Promise<Record<string, unknown>>;
  cancelFn?: () => void | undefined;
  decache?: () => void | undefined;
};

export type { ImageLoaderFn as default };
