import dcmjs from 'dcmjs';
import { makeArrayLike } from '../metadataProvider/makeArrayLike';
import { dictionaryLookup, mapTagInfo, parseVm } from '../Tags';
import type { IListenerInfo } from '../../types';

const { DicomMetadataListener } = dcmjs.utilities;

export type ListenerContext = {
  natural?: { name: string; singleVm: boolean | null; tag: string };
  parent?: { dest: Record<string, unknown> };
  dest?: Record<string, unknown>;
};

/**
 * Resolves whether a tag is single-valued.
 * Returns true for VM=1, false for multi-valued, null for unknown.
 */
function resolveSingleVm(
  tagData: { vm?: number } | undefined,
  dictEntry: { vm?: string } | undefined,
  tagInfo: IListenerInfo | undefined
): boolean | null {
  if (tagData && tagData.vm !== undefined && tagData.vm !== null) {
    return tagData.vm === 1;
  }
  const vm = tagInfo?.vm ?? dictEntry?.vm;
  if (vm !== undefined && vm !== null) {
    const parsed = parseVm(vm);
    if (parsed !== null) {
      return parsed === 1;
    }
  }
  return null;
}

/**
 * Returns true if the value looks like bulk data (e.g. pixel data):
 * - array of ArrayBuffer (or TypedArray), or
 * - array of arrays of ArrayBuffer (frames of fragments).
 */
function isBulkDataValue(val: unknown): boolean {
  if (!Array.isArray(val) || val.length === 0) {
    return false;
  }
  const first = val[0];
  if (first instanceof ArrayBuffer || ArrayBuffer.isView(first)) {
    return true;
  }
  if (Array.isArray(first)) {
    return val.every(
      (item) =>
        Array.isArray(item) &&
        item.every(
          (f: unknown) => f instanceof ArrayBuffer || ArrayBuffer.isView(f)
        )
    );
  }
  return false;
}

const DEFAULT_NAME_KEY = 'name';

/**
 * A filter for DicomMetadataListener that naturalizes tag names and values.
 *
 * Use `NaturalTagListener.createMetadataListener()` for a fully constructed
 * listener (single place that wires DicomMetadataListener + natural filter).
 *
 * The base listener handles value/values and stack; this filter converts in pop
 * so that bulk data (e.g. pixel data: array of frames, each frame array of
 * ArrayBuffer fragments) and scalar tags are stored under natural names.
 * The base {vr, Value} entry is removed after copying to the natural name.
 *
 * Tag names and VR/VM are resolved from tagInfo, mapTagInfo, and dcmjs dictionary.
 */
export class NaturalTagListener {
  constructor(_options?: { nameKey?: string }) {
    // nameKey could be used if DicomMetadataListener passed filter to _init; for now we use DEFAULT_NAME_KEY
  }

  /**
   * Returns a fully constructed DicomMetadataListener with the natural filter.
   * Single place to know how to build the overall listener for naturalized metadata.
   */
  static createMetadataListener(options?: { nameKey?: string }) {
    return new DicomMetadataListener({}, new NaturalTagListener(options));
  }

  addTag(
    next: (tag: string, tagInfo?: IListenerInfo) => void,
    tag: string,
    tagInfo?: IListenerInfo
  ) {
    const tagData = mapTagInfo.get(tag);
    const dictEntry = !tagData ? dictionaryLookup(tag) : undefined;
    const name =
      tagInfo?.name || tagData?.[DEFAULT_NAME_KEY] || dictEntry?.name || tag;
    const singleVm = resolveSingleVm(tagData, dictEntry, tagInfo);

    next(tag, tagInfo);

    (
      this as unknown as {
        current: {
          natural?: { name: string; singleVm: boolean | null; tag: string };
        };
      }
    ).current.natural = {
      name,
      singleVm,
      tag,
    };
  }

  pop(next: () => unknown): unknown {
    const listener = this as unknown as { current: ListenerContext };
    const nat = listener.current?.natural;
    const parentContext = listener.current?.parent;
    if (!nat || !parentContext?.dest) {
      return next();
    }

    const result = next();

    // Use the parent we had before next(); after next() the chain may not have updated current yet
    const parent = parentContext as { dest: Record<string, unknown> };
    const raw = parent.dest[nat.tag] as { Value?: unknown[] } | undefined;
    if (raw === undefined) {
      return result;
    }

    let val: unknown = raw.Value ?? raw;
    if (Array.isArray(val) && val.length === 1 && val[0] === undefined) {
      val = [];
    }

    if (isBulkDataValue(val)) {
      parent.dest[nat.name] = val;
      if (nat.name !== nat.tag) delete parent.dest[nat.tag];
      return result;
    }
    if (nat.singleVm === true && Array.isArray(val) && val.length === 1) {
      const one = val[0];
      if (
        typeof one === 'object' &&
        one !== null &&
        !(one instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(one)
      ) {
        parent.dest[nat.name] = makeArrayLike(one);
      } else {
        parent.dest[nat.name] = one;
      }
      if (nat.name !== nat.tag) delete parent.dest[nat.tag];
      return result;
    }
    if (
      nat.singleVm === null &&
      Array.isArray(val) &&
      val.length === 1 &&
      typeof val[0] === 'object' &&
      val[0] !== null &&
      !(val[0] instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(val[0])
    ) {
      parent.dest[nat.name] = makeArrayLike(val[0]);
    } else {
      parent.dest[nat.name] = val;
    }
    if (nat.name !== nat.tag) {
      delete parent.dest[nat.tag];
    }
    return result;
  }
}
