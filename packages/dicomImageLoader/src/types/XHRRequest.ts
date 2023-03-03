export interface LoaderXhrRequestError extends Error {
  request: XMLHttpRequest;
  response: any;
  status: number;
}

/**
 * @description mutable object
 */
export interface LoaderXhrRequestParams {
  url?: string;
  deferred?: {
    resolve: (value: ArrayBuffer | PromiseLike<ArrayBuffer>) => void;
    reject: (reason?: any) => void;
  };
  imageId?: string;
}

export interface LoaderXhrRequestPromise<T> extends Promise<T> {
  xhr?: XMLHttpRequest;
}
