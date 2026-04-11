import * as NiftiReader from 'nifti-reader-js';
import { eventTarget, triggerEvent, utilities } from '@cornerstonejs/core';
import type { mat3 } from 'gl-matrix';
import { rasToLps } from './helpers/convert';
import Events from './enums/Events';
import { NIFTI_LOADER_SCHEME } from './constants';
import makeVolumeMetadata from './helpers/makeVolumeMetadata';
import { getArrayConstructor } from './helpers/dataTypeCodeHelper';
import { getOptions } from './internal';

type DicomMetadata = {
  Modality?: string;
  SeriesInstanceUID?: string;
  SeriesNumber?: number | string;
  SeriesDescription?: string;
  WindowCenter?: number | string | Array<number | string>;
  WindowWidth?: number | string | Array<number | string>;
  VOILUTFunction?: string;
  RescaleSlope?: number | string | Array<number | string>;
  RescaleIntercept?: number | string | Array<number | string>;
};

type HeaderInfo = {
  dimensions: number[];
  direction: mat3;
  isValid: boolean;
  message: string;
  origin: number[];
  version: number;
  orientation: number[];
  spacing: number[];
  header: unknown;
  arrayConstructor: any;
};

export const urlsMap = new Map();
const NIFTI1_HEADER_SIZE = 348;
const NIFTI2_HEADER_SIZE = 540;
const HEADER_CHECK_SIZE = Math.max(NIFTI1_HEADER_SIZE, NIFTI2_HEADER_SIZE);

export async function fetchArrayBuffer({
  url,
  onProgress,
  controller,
  onLoad,
  onHeader,
  loadFullVolume = false,
}) {
  const parsedUrl = new URL(url);
  const isCompressed = parsedUrl.pathname.endsWith('.gz');
  let receivedData = new Uint8Array(0);
  let niftiHeader = null;
  const sliceInfo = null;
  let contentLength;
  const receivedLength = 0;
  const signal = controller.signal;

  const options = getOptions();
  const defaultHeaders = {} as Record<string, string>;
  const beforeSendHeaders = await options.beforeSend?.(
    null,
    defaultHeaders,
    url
  );

  const headers = Object.assign({}, defaultHeaders, beforeSendHeaders);

  Object.keys(headers).forEach(function (key) {
    if (headers[key] === null) {
      headers[key] = undefined;
    }
  });

  try {
    const response = await fetch(url, { signal, headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    contentLength = response.headers.get('Content-Length');

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decompressionStream = isCompressed
      ? new DecompressionStream('gzip')
      : null;
    const decompressionWriter = decompressionStream
      ? decompressionStream.writable.getWriter()
      : null;

    readStream(
      reader,
      decompressionWriter,
      isCompressed,
      receivedLength,
      processChunk,
      controller
    ).catch(console.error);

    if (isCompressed && decompressionStream) {
      const decompressedStream = decompressionStream.readable.getReader();

      while (true) {
        const { done, value } = await decompressedStream.read();
        if (done) {
          break;
        }
        processChunk(value);
        if (niftiHeader && !loadFullVolume) {
          controller.abort();
          break;
        }
      }
    }

    if (onLoad && typeof onLoad === 'function') {
      onLoad();
    }
    return { data: receivedData, headerInfo: niftiHeader, sliceInfo };
  } catch (error) {
    // @ts-ignore
    if (error.name === 'AbortError') {
      console.log('Fetch aborted');
    } else {
      console.error('Fetch error:', error);
    }
    throw error;
  }

  function processChunk(chunk) {
    appendData(chunk);
    if (onProgress && typeof onProgress === 'function') {
      onProgress(receivedLength, contentLength);
    }
  }

  function appendData(data) {
    const newData = new Uint8Array(receivedData.length + data.length);
    newData.set(receivedData);
    newData.set(data, receivedData.length);
    receivedData = newData;

    if (
      !loadFullVolume &&
      !niftiHeader &&
      receivedData.length >= HEADER_CHECK_SIZE
    ) {
      niftiHeader = handleNiftiHeader(receivedData);
      if (niftiHeader && niftiHeader.isValid) {
        controller.abort();
      }

      onHeader?.(niftiHeader);
    }
  }
}

async function readStream(
  reader,
  decompressionWriter,
  isCompressed,
  receivedLength,
  processChunk,
  controller
) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (isCompressed) {
        decompressionWriter.close();
      }
      break;
    }

    receivedLength += value.length;

    if (isCompressed) {
      await decompressionWriter.write(value);
    } else {
      processChunk(value);
    }

    if (controller.signal.aborted) {
      break;
    }
  }
}

function handleNiftiHeader(data): HeaderInfo {
  if (data.length < HEADER_CHECK_SIZE) {
    // @ts-ignore
    return { isValid: false, message: 'Not enough data to check header' };
  }

  try {
    const headerBuffer = data.slice(0, HEADER_CHECK_SIZE).buffer;
    const header = NiftiReader.readHeader(headerBuffer);
    // @ts-ignore
    const version = header.sizeof_hdr === NIFTI2_HEADER_SIZE ? 2 : 1;
    const { orientation, origin, spacing } = rasToLps(header);
    const { dimensions, direction } = makeVolumeMetadata(
      header,
      orientation,
      1
    );

    const arrayConstructor = getArrayConstructor(header.datatypeCode);

    return {
      dimensions,
      direction,
      isValid: true,
      message: `Valid Nifti-${version} header detected`,
      origin,
      version,
      orientation,
      spacing,
      header,
      arrayConstructor,
    };
  } catch (error) {
    console.error('Error reading Nifti header:', error);
    // @ts-ignore
    return { isValid: false, message: 'Error reading Nifti header' };
  }
}

function toFiniteNumber(
  value: number | string | Array<number | string> | undefined
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const numberValue = toFiniteNumber(item);
      if (numberValue !== undefined) {
        return numberValue;
      }
    }
    return undefined;
  }

  const numericValue = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

async function fetchAndAllocateNiftiVolume(
  url: string,
  dicomMetadata?: DicomMetadata
) {
  const niftiURL = url;

  const onProgress = (loaded, total) => {
    const data = { volumeId: url, loaded, total };
    triggerEvent(eventTarget, Events.NIFTI_VOLUME_PROGRESS, { data });
  };

  const onLoad = () => {
    const data = { volumeId: url };
    triggerEvent(eventTarget, Events.NIFTI_VOLUME_LOADED, { data });
  };

  const controller = new AbortController();

  urlsMap.set(niftiURL, { controller, loading: true });

  const niftiHeader = (await new Promise((resolve) => {
    fetchArrayBuffer({
      url: niftiURL,
      onProgress,
      controller,
      onLoad,
      onHeader: resolve,
    });
  })) as HeaderInfo;

  const {
    dimensions,
    direction,
    isValid,
    message,
    origin,
    version,
    header,
    spacing,
    arrayConstructor,
  } = niftiHeader;

  const numImages = dimensions[2];

  if (!isValid) {
    console.error(message);
    return;
  }

  const imageIds = [];
  for (let i = 0; i < numImages; i++) {
    const frameIndex = numImages - 1 - i;
    const imageId = `nifti:${niftiURL}?frame=${frameIndex}`;
    const imageIdIndex = frameIndex;
    imageIds.push(imageId);

    const imageOrientationPatient = [
      direction[0],
      direction[1],
      direction[2],
      direction[3],
      direction[4],
      direction[5],
    ];

    const precision = 6;
    const imagePositionPatient = [
      parseFloat(
        (origin[0] + imageIdIndex * direction[6] * spacing[0]).toFixed(
          precision
        )
      ),
      parseFloat(
        (origin[1] + imageIdIndex * direction[7] * spacing[1]).toFixed(
          precision
        )
      ),
      parseFloat(
        (origin[2] + imageIdIndex * direction[8] * spacing[2]).toFixed(
          precision
        )
      ),
    ];

    const imagePlaneMetadata = {
      frameOfReferenceUID: '1.2.840.10008.1.4',
      rows: dimensions[1],
      columns: dimensions[0],
      imageOrientationPatient,
      rowCosines: direction.slice(0, 3),
      columnCosines: direction.slice(3, 6),
      imagePositionPatient,
      sliceThickness: spacing[2],
      sliceLocation: origin[2] + frameIndex * spacing[2],
      pixelSpacing: [spacing[0], spacing[1]],
      rowPixelSpacing: spacing[1],
      columnPixelSpacing: spacing[0],
    };

    const imagePixelMetadata = {
      samplesPerPixel: 1,
      photometricInterpretation: 'MONOCHROME2',
      rows: dimensions[1],
      columns: dimensions[0],
      // @ts-expect-error
      bitsAllocated: arrayConstructor.BYTES_PER_ELEMENT * 8,
      // @ts-expect-error
      bitsStored: arrayConstructor.BYTES_PER_ELEMENT * 8,
      // @ts-expect-error
      highBit: arrayConstructor.BYTES_PER_ELEMENT * 8 - 1,
      pixelRepresentation: 1,
      planarConfiguration: 0,
      pixelAspectRatio: '1\\1',
      redPaletteColorLookupTableDescriptor: [],
      greenPaletteColorLookupTableDescriptor: [],
      bluePaletteColorLookupTableDescriptor: [],
      redPaletteColorLookupTableData: [],
      greenPaletteColorLookupTableData: [],
      bluePaletteColorLookupTableData: [],
      smallestPixelValue: undefined,
      largestPixelValue: undefined,
    };

    const generalSeriesMetadata = {
      seriesDate: new Date(),
      seriesTime: new Date(),
      modality: dicomMetadata?.Modality,
      seriesInstanceUID: dicomMetadata?.SeriesInstanceUID,
      seriesNumber: dicomMetadata?.SeriesNumber,
      seriesDescription: dicomMetadata?.SeriesDescription,
    };

    utilities.genericMetadataProvider.add(imageId, {
      type: 'imagePixelModule',
      metadata: imagePixelMetadata,
    });

    utilities.genericMetadataProvider.add(imageId, {
      type: 'imagePlaneModule',
      metadata: imagePlaneMetadata,
    });

    utilities.genericMetadataProvider.add(imageId, {
      type: 'generalSeriesModule',
      metadata: generalSeriesMetadata,
    });

    utilities.genericMetadataProvider.add(imageId, {
      type: 'generalImageModule',
      metadata: {
        instanceNumber: i + 1,
      },
    });

    const windowCenter = toFiniteNumber(dicomMetadata?.WindowCenter);
    const windowWidth = toFiniteNumber(dicomMetadata?.WindowWidth);

    if (windowCenter !== undefined && windowWidth !== undefined) {
      utilities.genericMetadataProvider.add(imageId, {
        type: 'voiLutModule',
        metadata: {
          windowCenter: [windowCenter],
          windowWidth: [windowWidth],
          voiLUTFunction: dicomMetadata?.VOILUTFunction || 'LINEAR',
        },
      });
    }

    utilities.genericMetadataProvider.add(imageId, {
      type: 'modalityLutModule',
      metadata: {
        rescaleSlope: 1,
        rescaleIntercept: 0,
        modalityLUTSequence: [],
      },
    });

    utilities.genericMetadataProvider.add(imageId, {
      type: 'niftiVersion',
      metadata: {
        version,
      },
    });

    // @ts-ignore
    utilities.genericMetadataProvider.addRaw(imageId, {
      type: 'niftiHeader',
      metadata: {
        header,
      },
    });
  }

  urlsMap.delete(niftiURL);

  return imageIds;
}

async function createNiftiImageIdsAndCacheMetadata({
  url,
  dicomMetadata,
}: {
  url: string;
  dicomMetadata?: DicomMetadata;
}) {
  const imageIds = await fetchAndAllocateNiftiVolume(url, dicomMetadata);
  return imageIds;
}

export { createNiftiImageIdsAndCacheMetadata };
