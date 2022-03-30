/**
 * Any volumeLoader function should implement a loading given the volumeId
 * and returns a mandatory promise which will resolve to the loaded volume object.
 * Additional `cancelFn` and `decache` can be implemented.
 */
type VolumeLoaderFn = (
  volumeId: string,
  options?: Record<string, any>
) => {
  /** promise that resolves to the volume object */
  promise: Promise<Record<string, any>>;
  /** cancel function */
  cancelFn?: () => void | undefined;
  /** decache function */
  decache?: () => void | undefined;
};

export default VolumeLoaderFn;
