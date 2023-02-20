export interface CornerstoneWadoLoaderXhrRequestError extends Error {
  request: XMLHttpRequest;
  response: any;
  status: number;
}

/**
 * @description mutable object
 */
export interface CornerstoneWadoLoaderXhrRequestParams {
  url?: string;
  deferred?: {
    resolve: (value: ArrayBuffer | PromiseLike<ArrayBuffer>) => void;
    reject: (reason?: any) => void;
  };
  imageId?: string;
}

export interface CornerstoneWadoLoaderXhrRequestPromise<T> extends Promise<T> {
  xhr?: XMLHttpRequest;
}
