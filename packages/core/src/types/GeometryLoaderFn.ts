import type IGeometry from './IGeometry';

/**
 * Any geometryLoader function should implement a loading given the geometryId
 * and returns a mandatory promise which will resolve to the loaded geometry object.
 * Additional `cancelFn` and `decache` can be implemented.
 */
type GeometryLoaderFn = (
  geometryId: string,
  options?: Record<string, unknown>,
  loaderOptions?: GeometryLoaderOptions
) => {
  /** promise that resolves to the geometry object */
  promise: Promise<IGeometry>;
  /** cancel function */
  cancelFn?: () => void | undefined;
  /** decache function */
  decache?: () => void | undefined;
};

export interface GeometryLoaderOptions {
  beforeSend?: (
    xhr: XMLHttpRequest,
    defaultHeaders: Record<string, string>
  ) => Record<string, string> | void;
}

export type { GeometryLoaderFn as default };
