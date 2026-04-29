import dcmjs from 'dcmjs';
import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';
import { MetaDataIterator, NaturalTagListener } from '../dicomStream';
import { cacheData, setCacheData } from './cacheData';
import { baseImageIdQueryFilter } from './imageIdsProviders';

const { AsyncDicomReader } = dcmjs.async;

export const ASYNC_NATURALIZED = 'asyncNaturalized';
const NATURAL_BASE_IMAGE_ID_FILTER_PRIORITY = 60_000;
const NATURALIZED_HANDLER_PRIORITY = 30_000;
const ASYNC_NATURALIZED_HANDLER_PRIORITY = 30_000;

type Part10Input =
  | ArrayBuffer
  | Uint8Array
  | (() => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>);

function toArrayBuffer(part10Value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (part10Value instanceof ArrayBuffer) {
    return part10Value;
  }
  return part10Value.buffer.slice(
    part10Value.byteOffset,
    part10Value.byteOffset + part10Value.byteLength
  );
}

async function resolvePart10Input(part10: Part10Input): Promise<ArrayBuffer> {
  const resolvedValue = typeof part10 === 'function' ? await part10() : part10;
  if (
    !(resolvedValue instanceof ArrayBuffer) &&
    !(resolvedValue instanceof Uint8Array)
  ) {
    throw new Error('part10 must resolve to ArrayBuffer or Uint8Array');
  }
  return toArrayBuffer(resolvedValue);
}

/**
 * Converts DICOMweb JSON-style metadata into a NATURALIZED object
 * using the standard metadata iterator/listener pipeline.
 */
export function naturalizeDicomwebMetadata(metadata: Record<string, unknown>) {
  const iterator = new MetaDataIterator(metadata);
  const listener = NaturalTagListener.createMetadataListener();
  listener.startObject();
  iterator.syncIterator(listener);
  return listener.pop();
}

/**
 * Naturalizes a Part10 payload into a DICOM dictionary-like object.
 *
 * Supports direct binary input or a lazy resolver function and preserves
 * transfer syntax information on the returned naturalized object.
 */
export async function naturalizePart10Buffer(part10: Part10Input) {
  const arrayBuffer = await resolvePart10Input(part10);
  const reader = new AsyncDicomReader();
  const listener = NaturalTagListener.createMetadataListener();

  reader.stream.addBuffer(arrayBuffer);
  reader.stream.setComplete();
  await reader.readFile({ listener });

  const naturalized = reader.dict;
  const transferSyntaxUid = reader.syntax;
  if (transferSyntaxUid) {
    naturalized.TransferSyntaxUID = Array.isArray(transferSyntaxUid)
      ? transferSyntaxUid[0]
      : transferSyntaxUid;
  }

  return naturalized;
}

/**
 * Typed NATURALIZED provider that handles option-driven synchronous metadata
 * ingestion via `{ metadata }`.
 */
function naturalizedOptionsProvider(next, query: string, data, options) {
  const metadata = options?.metadata;
  if (metadata && typeof metadata === 'object') {
    return naturalizeDicomwebMetadata(metadata as Record<string, unknown>);
  }
  return next(query, data, options);
}

/**
 * Typed `asyncNaturalized` provider for `{ part10 }` ingestion.
 *
 * Uses shared async-cache deduplication and writes successful results into
 * the NATURALIZED cache for subsequent typed-provider lookups.
 */
function asyncNaturalizedProvider(next, query: string, data, options) {
  const part10 = options?.part10 as Part10Input | undefined;
  if (!part10) {
    return next(query, data, options);
  }
  return cacheData.fromAsyncLookup(
    ASYNC_NATURALIZED,
    query,
    async () => {
      const naturalized = await naturalizePart10Buffer(part10);
      setCacheData(MetadataModules.NATURALIZED, query, naturalized);
      return naturalized;
    },
    { ...options, noCache: true }
  );
}

/**
 * Registers NATURALIZED-related handlers:
 * - base-image-id query normalization filter
 * - synchronous DICOMweb metadata naturalization
 * - asynchronous Part10 naturalization
 */
export function registerNaturalizedHandlers() {
  addTypedProvider(MetadataModules.NATURALIZED, baseImageIdQueryFilter, {
    priority: NATURAL_BASE_IMAGE_ID_FILTER_PRIORITY,
  });
  addTypedProvider(MetadataModules.NATURALIZED, naturalizedOptionsProvider, {
    priority: NATURALIZED_HANDLER_PRIORITY,
  });
  addTypedProvider(ASYNC_NATURALIZED, asyncNaturalizedProvider, {
    priority: ASYNC_NATURALIZED_HANDLER_PRIORITY,
  });
}
