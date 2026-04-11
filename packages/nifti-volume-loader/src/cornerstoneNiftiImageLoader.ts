import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  eventTarget,
  metaData,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';
import * as NiftiReader from 'nifti-reader-js';
import { Events } from './enums';
import { modalityScaleNifti } from './helpers';
import { getOptions } from './internal';

type NiftiDataFetchState =
  | {
      status: 'fetching';
    }
  | {
      status: 'fetched';
      scalarData: Types.PixelDataTypedArray;
    };

type HeaderValue = string | null | undefined;
type HeaderMap = Record<string, string>;
type VoiLutMetadata = {
  windowCenter?: number | number[];
  windowWidth?: number | number[];
  voiLUTFunction?: string;
};
type ModalityLutMetadata = {
  rescaleSlope?: number;
  rescaleIntercept?: number;
};
type NiftiLoadingOverlay = {
  wrap: HTMLDivElement;
  label: HTMLDivElement;
  barFill: HTMLSpanElement;
  reposition: () => void;
  repositionInterval: ReturnType<typeof setInterval>;
};

const dataFetchStateMap: Map<string, NiftiDataFetchState> = new Map();
let niftiLoadingOverlay: NiftiLoadingOverlay | null = null;

const PARALLEL_NUM_PARTS = 6;
const PARALLEL_MIN_SIZE = 32 * 1024 * 1024;

function findNiftiOverlayTarget(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const selectors = [
    '[data-cy="viewport-grid"]',
    '[class*="ViewportGrid"]',
    '[class*="viewport-grid"]',
    '#layoutManagerTarget',
    '#layoutContent',
  ];

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.clientWidth > 0 && element.clientHeight > 0) {
      return element;
    }
  }

  const viewports = document.querySelectorAll<HTMLElement>(
    '.cornerstone-viewport-element, .viewport-element'
  );

  if (viewports.length === 1) {
    let element = viewports[0].parentElement;

    while (
      element &&
      element.parentElement &&
      element.clientWidth === viewports[0].clientWidth &&
      element.clientHeight === viewports[0].clientHeight
    ) {
      element = element.parentElement;
    }

    return element;
  }

  if (viewports.length > 1) {
    let lowestCommonAncestor = viewports[0].parentElement;

    while (
      lowestCommonAncestor &&
      !Array.from(viewports).every((viewport) =>
        lowestCommonAncestor?.contains(viewport)
      )
    ) {
      lowestCommonAncestor = lowestCommonAncestor.parentElement;
    }

    if (lowestCommonAncestor) {
      return lowestCommonAncestor;
    }
  }

  return null;
}

function ensureNiftiLoadingOverlay(): NiftiLoadingOverlay | null {
  if (niftiLoadingOverlay || typeof document === 'undefined') {
    return niftiLoadingOverlay;
  }

  const target = findNiftiOverlayTarget();
  const wrap = document.createElement('div');
  wrap.id = 'nifti-loading-overlay';

  const applyPosition = () => {
    if (target) {
      const rect = target.getBoundingClientRect();
      wrap.style.top = rect.top + 'px';
      wrap.style.left = rect.left + 'px';
      wrap.style.width = rect.width + 'px';
      wrap.style.height = rect.height + 'px';
    } else {
      wrap.style.top = '0';
      wrap.style.left = '0';
      wrap.style.width = '100vw';
      wrap.style.height = '100vh';
    }
  };

  wrap.style.cssText = [
    'position:fixed',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'flex-direction:column',
    'gap:14px',
    'background:rgba(0,0,0,0.55)',
    'backdrop-filter:blur(2px)',
    '-webkit-backdrop-filter:blur(2px)',
    'z-index:2147483647',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'color:#fff',
    'pointer-events:all',
  ].join(';');

  applyPosition();

  const style = document.createElement('style');
  style.textContent =
    '@keyframes nifti-spin{to{transform:rotate(360deg)}}' +
    '#nifti-loading-overlay .nifti-spinner{width:56px;height:56px;border:5px solid rgba(255,255,255,0.2);border-top-color:#5acbfa;border-radius:50%;animation:nifti-spin 0.9s linear infinite}' +
    '#nifti-loading-overlay .nifti-bar{width:260px;height:6px;border-radius:3px;background:rgba(255,255,255,0.2);overflow:hidden}' +
    '#nifti-loading-overlay .nifti-bar>span{display:block;height:100%;width:0%;background:#5acbfa;transition:width .15s linear}' +
    '#nifti-loading-overlay .nifti-label{font-size:14px;letter-spacing:0.02em;text-shadow:0 1px 2px rgba(0,0,0,0.6)}';
  wrap.appendChild(style);

  const spinner = document.createElement('div');
  spinner.className = 'nifti-spinner';

  const label = document.createElement('div');
  label.className = 'nifti-label';
  label.textContent = 'Loading volume...';

  const bar = document.createElement('div');
  bar.className = 'nifti-bar';

  const barFill = document.createElement('span');
  bar.appendChild(barFill);

  wrap.appendChild(spinner);
  wrap.appendChild(label);
  wrap.appendChild(bar);
  document.body.appendChild(wrap);

  const reposition = () => applyPosition();
  window.addEventListener('resize', reposition);
  const repositionInterval = setInterval(reposition, 250);

  niftiLoadingOverlay = {
    wrap,
    label,
    barFill,
    reposition,
    repositionInterval,
  };

  return niftiLoadingOverlay;
}

function updateNiftiLoadingOverlay(loaded: number, total?: number): void {
  const overlay = ensureNiftiLoadingOverlay();

  if (!overlay) {
    return;
  }

  if (total && Number.isFinite(total) && total > 0) {
    const percent = Math.max(0, Math.min(100, (loaded / total) * 100));
    overlay.barFill.style.width = percent.toFixed(1) + '%';

    const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
    overlay.label.textContent =
      'Loading volume... ' +
      percent.toFixed(0) +
      '% (' +
      mb(loaded) +
      ' / ' +
      mb(total) +
      ' MB)';
  } else {
    const mb = (loaded / (1024 * 1024)).toFixed(1);
    overlay.label.textContent = 'Loading volume... ' + mb + ' MB';
  }
}

function hideNiftiLoadingOverlay(): void {
  if (!niftiLoadingOverlay) {
    return;
  }

  const { wrap, reposition, repositionInterval } = niftiLoadingOverlay;
  niftiLoadingOverlay = null;

  window.removeEventListener('resize', reposition);
  clearInterval(repositionInterval);

  if (wrap.parentNode) {
    wrap.parentNode.removeChild(wrap);
  }
}

async function fetchArrayBufferParallel({
  url,
  signal,
  onload,
  onProgress,
}: {
  url: string;
  signal?: AbortSignal;
  onload?: () => void;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<ArrayBuffer | null> {
  const options = getOptions();

  const buildHeaders = async (
    extra?: Record<string, string>
  ): Promise<HeaderMap> => {
    const defaultHeaders = {} as Record<string, string>;
    let beforeSendHeaders: Record<string, HeaderValue> = {};

    try {
      beforeSendHeaders =
        ((await (options as any).beforeSend?.(null, defaultHeaders, url)) as
          | Record<string, HeaderValue>
          | undefined) || {};
    } catch {
      beforeSendHeaders = {};
    }

    const merged = Object.assign(
      {},
      defaultHeaders,
      beforeSendHeaders,
      extra || {}
    ) as Record<string, HeaderValue>;

    const cleanHeaders: HeaderMap = {};
    Object.keys(merged).forEach((key) => {
      const value = merged[key];
      if (value !== null && value !== undefined) {
        cleanHeaders[key] = value;
      }
    });

    return cleanHeaders;
  };

  let total = 0;
  let acceptsRanges = false;

  try {
    const head = await fetch(url, {
      method: 'HEAD',
      signal,
      headers: await buildHeaders(),
    });

    if (head.ok) {
      total = parseInt(head.headers.get('Content-Length') || '0', 10) || 0;
      acceptsRanges =
        (head.headers.get('Accept-Ranges') || '').toLowerCase() === 'bytes';
    }
  } catch {
    acceptsRanges = false;
  }

  if (!total || !acceptsRanges || total < PARALLEL_MIN_SIZE) {
    return null;
  }

  const partSize = Math.ceil(total / PARALLEL_NUM_PARTS);
  const partBuffers: Uint8Array[] = new Array(PARALLEL_NUM_PARTS);
  const perPartLoaded = new Array(PARALLEL_NUM_PARTS).fill(0);

  const reportProgress = () => {
    const loaded = perPartLoaded.reduce((sum, value) => sum + value, 0);
    onProgress?.(loaded, total);
  };

  const fetchPart = async (index: number) => {
    const start = index * partSize;
    const end = Math.min(start + partSize - 1, total - 1);
    const response = await fetch(url, {
      signal,
      headers: await buildHeaders({ Range: `bytes=${start}-${end}` }),
    });

    if (!response.ok && response.status !== 206) {
      throw new Error('range status ' + response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('range response body missing');
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunks.push(value);
      received += value.length;
      perPartLoaded[index] = received;
      reportProgress();
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    partBuffers[index] = buffer;
  };

  try {
    await Promise.all(
      Array.from({ length: PARALLEL_NUM_PARTS }, (_, index) => fetchPart(index))
    );
  } catch (error) {
    console.warn(
      '[nifti-loader] parallel fetch failed, falling back:',
      (error as Error)?.message
    );
    return null;
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of partBuffers) {
    result.set(part, offset);
    offset += part.length;
  }

  onload?.();
  return result.buffer;
}

function fetchArrayBuffer({
  url,
  signal,
  onload,
}: {
  url: string;
  signal?: AbortSignal;
  onload?: () => void;
}): Promise<ArrayBuffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const parallelResult = await fetchArrayBufferParallel({
        url,
        signal,
        onload,
        onProgress: (loaded, total) => {
          const data = { url, loaded, total };
          triggerEvent(eventTarget, Events.NIFTI_VOLUME_PROGRESS, { data });
          updateNiftiLoadingOverlay(loaded, total);
        },
      });

      if (parallelResult) {
        resolve(parallelResult);
        return;
      }
    } catch (error) {
      console.warn(
        '[nifti-loader] parallel path threw, falling back:',
        (error as Error)?.message
      );
    }

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    const defaultHeaders = {} as Record<string, string>;
    const options = getOptions();
    const beforeSendHeaders = await options.beforeSend?.(
      xhr,
      defaultHeaders,
      url
    );
    const headers = Object.assign({}, defaultHeaders, beforeSendHeaders);

    xhr.responseType = 'arraybuffer';

    Object.keys(headers).forEach((key) => {
      if (headers[key] === null) {
        return;
      }
      xhr.setRequestHeader(key, headers[key]);
    });

    const onLoadHandler = () => {
      onload?.();

      if (signal) {
        signal.removeEventListener('abort', onAbortHandler);
      }

      resolve(xhr.response as ArrayBuffer);
    };

    const onAbortHandler = () => {
      xhr.abort();
      xhr.removeEventListener('load', onLoadHandler);
      hideNiftiLoadingOverlay();
      reject(new Error('Request aborted'));
    };

    xhr.addEventListener('load', onLoadHandler);
    xhr.addEventListener('error', () => {
      hideNiftiLoadingOverlay();
    });
    xhr.addEventListener('abort', () => {
      hideNiftiLoadingOverlay();
    });

    const onProgress = (loaded: number, total: number) => {
      const data = { url, loaded, total };
      triggerEvent(eventTarget, Events.NIFTI_VOLUME_PROGRESS, { data });
      updateNiftiLoadingOverlay(loaded, total);
    };

    updateNiftiLoadingOverlay(0, 0);

    xhr.onprogress = (event) => {
      onProgress(event.loaded, event.total);
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

export default function cornerstoneNiftiImageLoader(
  imageId: string
): Types.IImageLoadObject {
  const [url, frame] = imageId.substring(6).split('?frame=');
  const sliceIndex = parseInt(frame, 10);

  const imagePixelModule = metaData.get(
    Enums.MetadataModules.IMAGE_PIXEL,
    imageId
  ) as Types.ImagePixelModule;

  const imagePlaneModule = metaData.get(
    Enums.MetadataModules.IMAGE_PLANE,
    imageId
  ) as Types.ImagePlaneModule;

  const promise = new Promise<Types.IImage>((resolve, reject) => {
    if (!dataFetchStateMap.get(url)) {
      dataFetchStateMap.set(url, { status: 'fetching' });
      fetchAndProcessNiftiData(
        imageId,
        url,
        sliceIndex,
        imagePixelModule,
        imagePlaneModule
      )
        .then(resolve)
        .catch(reject);
    } else {
      waitForNiftiData(
        imageId,
        url,
        sliceIndex,
        imagePixelModule,
        imagePlaneModule
      )
        .then(resolve)
        .catch(reject);
    }
  });

  return {
    promise: promise as Promise<Types.IImage>,
    cancelFn: undefined,
    decache: () => {
      dataFetchStateMap.delete(url);
    },
  };
}

async function fetchAndProcessNiftiData(
  imageId: string,
  url: string,
  sliceIndex: number,
  imagePixelModule: Types.ImagePixelModule,
  imagePlaneModule: Types.ImagePlaneModule
): Promise<Types.IImage> {
  try {
    let niftiBuffer = await fetchArrayBuffer({ url });
    let niftiHeader = null;
    let niftiImage = null;

    if (NiftiReader.isCompressed(niftiBuffer)) {
      niftiBuffer = NiftiReader.decompress(niftiBuffer);
    }

    if (NiftiReader.isNIFTI(niftiBuffer)) {
      niftiHeader = NiftiReader.readHeader(niftiBuffer);
      niftiImage = NiftiReader.readImage(niftiHeader, niftiBuffer);
    } else {
      const errorMessage = 'The provided buffer is not a valid NIFTI file.';
      console.warn(errorMessage);
      throw new Error(errorMessage);
    }

    const { scalarData } = modalityScaleNifti(niftiHeader, niftiImage);
    dataFetchStateMap.set(url, { status: 'fetched', scalarData });

    const image = createImage(
      imageId,
      sliceIndex,
      imagePixelModule,
      imagePlaneModule,
      scalarData
    ) as unknown as Types.IImage;

    hideNiftiLoadingOverlay();
    return image;
  } catch (error) {
    hideNiftiLoadingOverlay();
    throw error;
  }
}

function waitForNiftiData(
  imageId: string,
  url: string,
  sliceIndex: number,
  imagePixelModule: Types.ImagePixelModule,
  imagePlaneModule: Types.ImagePlaneModule
): Promise<Types.IImage> {
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      const dataFetchState = dataFetchStateMap.get(url);

      if (!dataFetchState) {
        clearInterval(intervalId);
        reject(
          `dataFetchState for ${url} is not found. The cache was purged before it completed loading.`
        );
      }

      if (dataFetchState?.status === 'fetched') {
        clearInterval(intervalId);
        resolve(
          createImage(
            imageId,
            sliceIndex,
            imagePixelModule,
            imagePlaneModule,
            dataFetchState.scalarData
          ) as unknown as Types.IImage
        );
      }
    }, 10);
  });
}

function createImage(
  imageId: string,
  sliceIndex: number,
  imagePixelModule: Types.ImagePixelModule,
  imagePlaneModule: Types.ImagePlaneModule,
  niftiScalarData: Types.PixelDataTypedArray
) {
  const { rows, columns } = imagePlaneModule;
  const numVoxels = rows * columns;
  const sliceOffset = numVoxels * sliceIndex;

  const pixelData = new (niftiScalarData.constructor as {
    new (size: number): Types.PixelDataTypedArray;
  })(numVoxels);
  pixelData.set(niftiScalarData.subarray(sliceOffset, sliceOffset + numVoxels));

  const rowBuffer = new (niftiScalarData.constructor as {
    new (size: number): Types.PixelDataTypedArray;
  })(columns);
  const half = rows >> 1;
  for (let y = 0; y < half; y++) {
    const topStart = y * columns;
    const bottomStart = (rows - 1 - y) * columns;
    rowBuffer.set(pixelData.subarray(topStart, topStart + columns));
    pixelData.copyWithin(topStart, bottomStart, bottomStart + columns);
    pixelData.set(rowBuffer, bottomStart);
  }

  // @ts-ignore
  const voxelManager = utilities.VoxelManager.createImageVoxelManager({
    width: columns,
    height: rows,
    numberOfComponents: 1,
    scalarData: pixelData,
  });

  let minPixelValue = pixelData[0];
  let maxPixelValue = pixelData[0];
  for (let i = 1; i < pixelData.length; i++) {
    const pixelValue = pixelData[i];
    if (pixelValue < minPixelValue) {
      minPixelValue = pixelValue;
    }
    if (pixelValue > maxPixelValue) {
      maxPixelValue = pixelValue;
    }
  }

  const voiLut = metaData.get('voiLutModule', imageId) as
    | VoiLutMetadata
    | undefined;
  const modalityLut = metaData.get('modalityLutModule', imageId) as
    | ModalityLutMetadata
    | undefined;

  let windowCenter: number | undefined;
  let windowWidth: number | undefined;

  if (voiLut) {
    const wc = Array.isArray(voiLut.windowCenter)
      ? voiLut.windowCenter[0]
      : voiLut.windowCenter;
    const ww = Array.isArray(voiLut.windowWidth)
      ? voiLut.windowWidth[0]
      : voiLut.windowWidth;

    if (Number.isFinite(wc) && Number.isFinite(ww)) {
      windowCenter = wc;
      windowWidth = ww;
    }
  }

  const slope =
    modalityLut && Number.isFinite(modalityLut.rescaleSlope)
      ? modalityLut.rescaleSlope
      : 1;
  const intercept =
    modalityLut && Number.isFinite(modalityLut.rescaleIntercept)
      ? modalityLut.rescaleIntercept
      : 0;

  return {
    imageId,
    dataType: niftiScalarData.constructor
      .name as Types.PixelDataTypedArrayString,
    columnPixelSpacing: imagePlaneModule.columnPixelSpacing,
    columns: imagePlaneModule.columns,
    height: imagePlaneModule.rows,
    invert: imagePixelModule.photometricInterpretation === 'MONOCHROME1',
    rowPixelSpacing: imagePlaneModule.rowPixelSpacing,
    rows: imagePlaneModule.rows,
    sizeInBytes: rows * columns * niftiScalarData.BYTES_PER_ELEMENT,
    width: imagePlaneModule.columns,
    getPixelData: () => voxelManager.getScalarData(),
    getCanvas: undefined,
    numberOfComponents: undefined,
    voxelManager,
    minPixelValue,
    maxPixelValue,
    windowCenter,
    windowWidth,
    slope,
    intercept,
  };
}
