import { makeArrayLike } from '../metadataProvider/makeArrayLike';
import { dictionaryLookup, mapTagInfo, parseVm } from '../Tags';
import type { IListenerInfo, MetadataValueType } from './DicomStreamTypes';

interface NaturalContext {
  parent: NaturalContext | null;
  dest: unknown;
  type: string;
  tag?: string;
  level: number;
  length?: number;
  _name?: string;
  _singleVm?: boolean | null;
}

/**
 * Resolves whether a tag is single-valued.
 * Returns true for VM=1, false for multi-valued, null for unknown.
 */
function resolveSingleVm(
  tagData: { vm?: number } | undefined,
  dictEntry: { vm?: string } | undefined,
  tagInfo: IListenerInfo | undefined
): boolean | null {
  // Prefer mapTagInfo vm (already parsed to number)
  if (tagData && tagData.vm !== undefined && tagData.vm !== null) {
    return tagData.vm === 1;
  }
  // Use tagInfo vm (from AsyncDicomReader or iterator)
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
 * A standalone DICOM listener that produces naturalized JavaScript objects.
 *
 * Compatible with both AsyncDicomReader and the sync iterators
 * (MetaDataIterator, DataSetIterator). Also provides a filter factory
 * for use with DicomMetadataListener.
 *
 * Tag names and VR/VM are resolved from:
 * 1. tagInfo (provided by the source, e.g. AsyncDicomReader)
 * 2. mapTagInfo (module membership from Tags.ts)
 * 3. dcmjs dictionary (for tags not in Tags.ts)
 */
export class NaturalTagListener {
  public current: NaturalContext | null = null;
  public information: Record<string, unknown> | null = null;

  private _drain: (() => Promise<void>) | null = null;
  private _nameKey: string;

  constructor(options?: {
    nameKey?: string;
    information?: Record<string, unknown>;
  }) {
    this._nameKey = options?.nameKey || 'name';
    this.information = options?.information || {};
  }

  /**
   * Pushes a new object context onto the stack.
   * If called within a tag context, the object is registered as a value first.
   */
  public startObject(dest: Record<string, unknown> = {}) {
    if (this.current) {
      this.value(dest);
    }
    const level = this.current ? (this.current.level ?? 0) + 1 : 0;
    this.current = {
      parent: this.current,
      dest,
      type: 'object',
      level,
    };
  }

  /**
   * Pushes a new tag context onto the stack.
   * Resolves the natural name and VM from tagInfo, mapTagInfo, and dcmjs dictionary.
   */
  public addTag(tag: string, tagInfo?: IListenerInfo) {
    const tagData = mapTagInfo.get(tag);
    const dictEntry = !tagData ? dictionaryLookup(tag) : undefined;
    const nameKey = this._nameKey;
    const name = tagInfo?.name || tagData?.[nameKey] || dictEntry?.name || tag;
    const singleVm = resolveSingleVm(tagData, dictEntry, tagInfo);
    const level = this.current ? (this.current.level ?? 0) : 0;

    this.current = {
      parent: this.current,
      dest: null,
      type: tag,
      tag,
      level,
      length: tagInfo?.length as number,
      _name: name,
      _singleVm: singleVm,
    };
  }

  /**
   * Adds a value to the current context.
   * For object contexts, pushes into the array/object.
   * For tag contexts, stores under the natural name on the parent object.
   */
  public value(v: unknown) {
    const cur = this.current;
    if (!cur) {
      return;
    }

    // Object context or array dest — push directly
    if (cur.type === 'object' || Array.isArray(cur.dest)) {
      (cur.dest as unknown[]).push(v);
      return;
    }

    // Tag context — store under natural name on parent
    const parent = cur.parent;
    const name = cur._name;

    if (!cur.dest) {
      if (cur._singleVm === true) {
        cur.dest = makeArrayLike(v);
        parent.dest[name] = cur.dest;
        return;
      }
      cur.dest = [];
      parent.dest[name] = cur.dest;
    }

    if (cur._singleVm === true) {
      // Multiple values for a declared single-VM tag — switch to array
      console.error('Storing multiple values into', name, cur.dest, v);
      cur._singleVm = null;
      cur.dest = [cur.dest as MetadataValueType];
      parent.dest[name] = cur.dest;
    }

    (cur.dest as MetadataValueType[]).push(v as MetadataValueType);
  }

  /**
   * Convenience method: adds all values and pops the current tag context.
   */
  public values(array: unknown[]) {
    for (const v of array) {
      this.value(v);
    }
    this.pop();
  }

  /**
   * Pops the current context off the stack and returns its dest.
   * For tag contexts with unknown VM and a single object value,
   * applies makeArrayLike optimization.
   */
  public pop(): unknown {
    const cur = this.current;
    if (!cur) {
      return undefined;
    }

    let result = cur.dest;

    // Single-item array of object with unknown VM → makeArrayLike
    if (
      Array.isArray(result) &&
      result.length === 1 &&
      cur._singleVm === null &&
      typeof result[0] === 'object'
    ) {
      result = makeArrayLike(result[0]);
      if (cur.parent && cur._name) {
        cur.parent.dest[cur._name] = result;
      }
    }

    this.current = cur.parent;
    return result;
  }

  /**
   * Sets the backpressure drain function for streaming use with AsyncDicomReader.
   */
  public setDrain(fn: (() => Promise<void>) | null) {
    this._drain = typeof fn === 'function' ? fn : null;
  }

  /**
   * Returns a Promise that resolves when backpressure is cleared.
   */
  public awaitDrain(): Promise<void> {
    return this._drain?.() || Promise.resolve();
  }

  /**
   * Creates a filter object for use with DicomMetadataListener.
   * When passed to `new DicomMetadataListener({}, NaturalTagListener.createFilter())`,
   * the output will be naturalized instead of the default {vr, Value} format.
   */
  public static createFilter(options?: { nameKey?: string }) {
    const nameKey = options?.nameKey || 'name';

    return {
      addTag(next, tag: string, tagInfo?: IListenerInfo) {
        const tagData = mapTagInfo.get(tag);
        const dictEntry = !tagData ? dictionaryLookup(tag) : undefined;
        const name =
          tagInfo?.name || tagData?.[nameKey] || dictEntry?.name || tag;
        const singleVm = resolveSingleVm(tagData, dictEntry, tagInfo);

        // Call base addTag for stack management
        next(tag, tagInfo);

        // Annotate current context with naturalization info
        this.current._natural = { name, singleVm, tag };
      },

      value(next, v: unknown) {
        const nat = this.current?._natural;
        if (nat) {
          // Store under natural name on parent instead of in {vr, Value}
          const parent = this.current.parent;
          if (!parent?.dest) {
            return next(v);
          }

          if (nat.singleVm === true && !nat._hasValue) {
            nat._hasValue = true;
            parent.dest[nat.name] =
              typeof v === 'object' && v !== null ? makeArrayLike(v) : v;
            return;
          }

          if (!nat._hasValue) {
            nat._hasValue = true;
            parent.dest[nat.name] = [v];
            return;
          }

          const existing = parent.dest[nat.name];
          if (nat.singleVm === true) {
            // Multiple values for single-vm: switch to array
            nat.singleVm = null;
            parent.dest[nat.name] = [existing, v];
            return;
          }

          if (Array.isArray(existing)) {
            existing.push(v);
          }
          return;
        }

        next(v);
      },

      pop(next) {
        const nat = this.current?._natural;
        if (nat && this.current.parent?.dest) {
          // Remove the hex-keyed {vr, Value} entry created by base addTag
          delete this.current.parent.dest[nat.tag];

          // Handle single-item array optimization for unknown VM
          const val = this.current.parent.dest[nat.name];
          if (
            nat.singleVm === null &&
            Array.isArray(val) &&
            val.length === 1 &&
            typeof val[0] === 'object'
          ) {
            this.current.parent.dest[nat.name] = makeArrayLike(val[0]);
          }
        }

        return next();
      },
    };
  }
}
