import dcmjs from 'dcmjs';
import { MetadataModules } from '../../enums';
import { addAddProvider, addTypedProvider } from '../../metaData';
import { MetaDataIterator, NaturalTagListener } from '../dicomStream';
import { baseImageIdQueryFilter } from './imageIdsProviders';

const { AsyncDicomReader } = dcmjs.async;

const NATURAL_BASE_IMAGE_ID_FILTER_PRIORITY = 60_000;
const NATURALIZED_ADD_HANDLER_PRIORITY = 30_000;

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
 * Add-path NATURALIZED provider that handles sync `{ dicomwebJson }` and async
 * `{ part10Buffer }` ingestion.
 */
function naturalizedAddProvider(next, query: string, data, options) {
  const dicomwebJson = options?.dicomwebJson ?? options?.metadata;
  if (dicomwebJson && typeof dicomwebJson === 'object') {
    return naturalizeDicomwebMetadata(dicomwebJson as Record<string, unknown>);
  }

  const part10Buffer = options?.part10Buffer ?? options?.part10;
  if (part10Buffer) {
    return naturalizePart10Buffer(part10Buffer as Part10Input);
  }

  return next(query, data, options);
}

/**
 * Registers NATURALIZED-related handlers for read and add paths:
 * - base-image-id query normalization filter
 * - sync/async ingestion through add-path providers
 */
export function registerNaturalizedHandlers() {
  addTypedProvider(MetadataModules.NATURALIZED, baseImageIdQueryFilter, {
    priority: NATURAL_BASE_IMAGE_ID_FILTER_PRIORITY,
  });
  addAddProvider(MetadataModules.NATURALIZED, baseImageIdQueryFilter, {
    priority: NATURAL_BASE_IMAGE_ID_FILTER_PRIORITY,
  });
  addAddProvider(MetadataModules.NATURALIZED, naturalizedAddProvider, {
    priority: NATURALIZED_ADD_HANDLER_PRIORITY,
  });
}
