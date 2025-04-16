import { createMesh } from './utils/mesh/createMesh';
import type { IGeometry, IGeometryLoadObject, MeshData } from '../types';
import { Events } from '../enums';
import eventTarget from '../eventTarget';
import { triggerEvent } from '../utilities';
import type { GeometryLoaderOptions } from '../types/GeometryLoaderFn';

function fetchArrayBuffer({
  url,
  signal,
  onload,
  loaderOptions,
}: {
  url: string;
  signal?: AbortSignal;
  onload?: () => void;
  loaderOptions: GeometryLoaderOptions;
}): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    const defaultHeaders = {} as Record<string, string>;
    const beforeSendHeaders = loaderOptions.beforeSend(xhr, defaultHeaders);
    const headers = Object.assign({}, defaultHeaders, beforeSendHeaders);

    xhr.responseType = 'arraybuffer';

    Object.keys(headers).forEach(function (key) {
      if (headers[key] === null) {
        return;
      }
      xhr.setRequestHeader(key, headers[key]);
    });

    const onLoadHandler = function (e) {
      if (onload && typeof onload === 'function') {
        onload();
      }

      // Remove event listener for 'abort'
      if (signal) {
        signal.removeEventListener('abort', onAbortHandler);
      }

      resolve(xhr.response);
    };

    const onAbortHandler = () => {
      xhr.abort();

      // Remove event listener for 'load'
      xhr.removeEventListener('load', onLoadHandler);

      reject(new Error('Request aborted'));
    };

    xhr.addEventListener('load', onLoadHandler);

    const onProgress = (loaded, total) => {
      const data = { url, loaded, total };
      triggerEvent(eventTarget, Events.GEOMETRY_LOAD_PROGRESS, { data });
    };

    xhr.onprogress = function (e) {
      onProgress(e.loaded, e.total);
    };

    if (signal && signal.aborted) {
      xhr.abort();
      reject(new Error('Request aborted'));
    } else if (signal) {
      signal.addEventListener('abort', onAbortHandler);
    }

    xhr.send();
  });
}

function cornerstoneMeshLoader(
  meshId: string,
  options: Record<string, unknown>,
  loaderOptions: GeometryLoaderOptions
): IGeometryLoadObject {
  const promise = new Promise<IGeometry>((resolve, reject) => {
    fetchAndProcessMeshData(meshId, options, loaderOptions)
      .then(resolve)
      .catch(reject);
  });
  return {
    promise: promise as Promise<IGeometry>,
    cancelFn: undefined,
    decache: () => {},
  };
}

async function fetchAndProcessMeshData(
  meshId: string,
  options: Record<string, unknown>,
  loaderOptions: GeometryLoaderOptions
): Promise<IGeometry> {
  const parts = meshId.split(':');
  const url = parts.slice(1).join(':');
  const meshBuffer = await fetchArrayBuffer({ url, loaderOptions });
  if (!options || !('geometryData' in options)) {
    throw new Error('Mesh must have a geometryData');
  }
  return createMesh(url, {
    ...(options.geometryData as MeshData),
    arrayBuffer: meshBuffer,
  }) as unknown as IGeometry;
}

export { cornerstoneMeshLoader };
