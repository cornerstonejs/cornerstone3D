import * as NiftiReader from 'nifti-reader-js';
import {
  eventTarget,
  metaData,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';
import { rasToLps } from './helpers/convert';
import Events from './enums/Events';
import { NIFTI_LOADER_SCHEME } from './constants';
import makeVolumeMetadata from './helpers/makeVolumeMetadata';
import { getArrayConstructor } from './helpers/dataTypeCodeHelper';

export const urlsMap = new Map();
const NIFTI1_HEADER_SIZE = 348;
const NIFTI2_HEADER_SIZE = 540;
const HEADER_CHECK_SIZE = Math.max(NIFTI1_HEADER_SIZE, NIFTI2_HEADER_SIZE);

// I really spent couple of hours here to use the stream request in the dicomImageLoader
// but could not make the decompression work properly and i gave up.
export async function fetchArrayBuffer({
  url,
  onProgress,
  controller,
  onLoad,
  onHeader,
  loadFullVolume = false,
}) {
  const isCompressed = url.endsWith('.gz');
  let receivedData = new Uint8Array(0);
  let niftiHeader = null;
  const sliceInfo = null;
  let contentLength;
  const receivedLength = 0;
  const signal = controller.signal;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    contentLength = response.headers.get('Content-Length');

    const reader = response.body.getReader();

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

    if (isCompressed) {
      const decompressedStream = decompressionStream.readable.getReader();
      while (true) {
        const { done, value } = await decompressedStream.read();
        if (done) {
          break;
        }
        processChunk(value);
        if (niftiHeader && !loadFullVolume) {
          controller.abort(); // Abort the fetch request once the header is retrieved
          break;
        }
      }
    }

    if (onLoad && typeof onLoad === 'function') {
      onLoad();
    }
    return { data: receivedData, headerInfo: niftiHeader, sliceInfo };
  } catch (error) {
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
        controller.abort(); // Abort the fetch request once the header is retrieved
      }

      // create imageIds and cache metadata
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

function handleNiftiHeader(data) {
  if (data.length < HEADER_CHECK_SIZE) {
    return { isValid: false, message: 'Not enough data to check header' };
  }

  try {
    const headerBuffer = data.slice(0, HEADER_CHECK_SIZE).buffer;
    const header = NiftiReader.readHeader(headerBuffer);
    const version = header.sizeof_hdr === NIFTI2_HEADER_SIZE ? 2 : 1;
    const { orientation, origin, spacing } = rasToLps(header);
    const { dimensions, direction } = makeVolumeMetadata(
      header,
      orientation,
      1 // pixelRepresentation
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
    return { isValid: false, message: 'Error reading Nifti header' };
  }
}

async function fetchAndAllocateNiftiVolume(volumeId) {
  const niftiURL = volumeId.substring(NIFTI_LOADER_SCHEME.length + 1);

  const onProgress = (loaded, total) => {
    const data = { volumeId, loaded, total };
    triggerEvent(eventTarget, Events.NIFTI_VOLUME_PROGRESS, { data });
  };

  const onLoad = () => {
    const data = { volumeId };
    triggerEvent(eventTarget, Events.NIFTI_VOLUME_LOADED, { data });
  };

  const controller = new AbortController();

  urlsMap.set(niftiURL, { controller, loading: true });

  const niftiHeader = await new Promise((resolve) => {
    fetchArrayBuffer({
      url: niftiURL,
      onProgress,
      controller,
      onLoad,
      onHeader: resolve, // Pass the resolve function to handle image IDs
    });
  });

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
    const imageId = `nifti:${niftiURL}?frame=${i}`;
    imageIds.push(imageId);

    // Create metadata for the image
    const imagePlaneMetadata = {
      frameOfReferenceUID: '1.2.840.10008.1.4',
      rows: dimensions[1],
      columns: dimensions[0],
      imageOrientationPatient: direction,
      rowCosines: direction.slice(0, 3),
      columnCosines: direction.slice(3, 6),
      imagePositionPatient: [...origin],
      sliceThickness: spacing[2],
      sliceLocation: origin[2] + i * spacing[2],
      pixelSpacing: [spacing[0], spacing[1]],
      rowPixelSpacing: spacing[1],
      columnPixelSpacing: spacing[0],
    };

    const imagePixelMetadata = {
      samplesPerPixel: 1,
      photometricInterpretation: 'MONOCHROME2',
      rows: dimensions[1],
      columns: dimensions[0],
      bitsAllocated: arrayConstructor.BYTES_PER_ELEMENT * 8,
      bitsStored: arrayConstructor.BYTES_PER_ELEMENT * 8,
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
      // modality: 'MR',
      // seriesInstanceUID: '1.2.840.10008.1.4',
      // seriesNumber: 1,
      // studyInstanceUID: '1.2.840.10008.1.4',
      seriesDate: new Date(),
      seriesTime: new Date(),
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
      type: 'niftiVersion',
      metadata: {
        version,
      },
    });

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

async function createNiftiImageIdsAndCacheMetadata({ url }) {
  const imageIds = await fetchAndAllocateNiftiVolume(url);
  return imageIds;
}

export { createNiftiImageIdsAndCacheMetadata };
