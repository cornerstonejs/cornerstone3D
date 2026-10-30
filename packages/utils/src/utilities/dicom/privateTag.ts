/**
 * The place of one private element in a naturalized dataset: read or write
 * the value as `location.container[location.key]`.
 */
export type PrivateTagLocation = {
  /** The private block (block form), or the dataset itself (hex-key form). */
  container: Record<string, unknown>;
  /** `xEE` in a block, or the 8-digit hex tag in the hex-key form. */
  key: string;
};

const BLOCK_KEY = /^([0-9A-Fa-f]{4}):(.+)$/;

function toHex(value: number | string, digits: number): string | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value < 16 ** digits
      ? value.toString(16).toUpperCase().padStart(digits, '0')
      : undefined;
  }
  return typeof value === 'string' &&
    new RegExp(`^[0-9A-Fa-f]{${digits}}$`).test(value)
    ? value.toUpperCase()
    : undefined;
}

/** The creator text without the LO padding, as dcmjs keys the block. */
function trimCreator(value: unknown): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string'
    ? // eslint-disable-next-line no-control-regex -- the NUL padding of a value
      text.replace(/^ +|[\0 ]+$/g, '')
    : undefined;
}

function isBlock(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The upper- or lower-case spelling of `key` that `object` has. */
function keyIn(object: object, key: string): string | undefined {
  if (key in object) {
    return key;
  }
  const lower = key.toLowerCase();
  return lower in object ? lower : undefined;
}

function findBlock(
  dataset: Record<string, unknown>,
  group: string,
  creator: string
): Record<string, unknown> | undefined {
  const direct =
    dataset[`${group}:${creator}`] ??
    dataset[`${group.toLowerCase()}:${creator}`];
  if (isBlock(direct)) {
    return direct;
  }
  // A key from another writer can keep the creator padding.
  for (const key in dataset) {
    const match = BLOCK_KEY.exec(key);
    if (
      match &&
      match[1].toUpperCase() === group &&
      trimCreator(match[2]) === creator &&
      isBlock(dataset[key])
    ) {
      return dataset[key] as Record<string, unknown>;
    }
  }
  return undefined;
}

/**
 * Finds a private element (PS3.5 7.8.1) by its group, its private creator and
 * its element number in the reserved block. See `getPrivateTagValue` for the
 * forms that it reads. Use the location to write a value back, for example a
 * resolved bulk data value, so that the value stays where later reads find it.
 *
 * @param dataset - a naturalized dataset or sequence item
 * @param group - the odd group, `0x7053` or `'7053'`
 * @param creator - the private creator text, `'Philips PET Private Group'`
 * @param element - the element number in the block, `0x09` or `'09'`
 * @returns the location of the element, or `undefined` when it is absent
 */
export function findPrivateTag(
  dataset: object | null | undefined,
  group: number | string,
  creator: string,
  element: number | string
): PrivateTagLocation | undefined {
  const gggg = toHex(group, 4);
  const ee = toHex(element, 2);
  const wanted = trimCreator(creator);
  if (!dataset || typeof dataset !== 'object' || !gggg || !ee || !wanted) {
    return undefined;
  }
  const data = dataset as Record<string, unknown>;

  const block = findBlock(data, gggg, wanted);
  const elementKey = block && keyIn(block, `x${ee}`);
  if (elementKey) {
    return { container: block, key: elementKey };
  }

  for (let xx = 0x10; xx <= 0xff; xx++) {
    const xxHex = toHex(xx, 2);
    const creatorKey = keyIn(data, `${gggg}00${xxHex}`);
    if (creatorKey && trimCreator(data[creatorKey]) === wanted) {
      const key = keyIn(data, `${gggg}${xxHex}${ee}`);
      return key ? { container: data, key } : undefined;
    }
  }
  return undefined;
}

/**
 * Reads a private element (PS3.5 7.8.1) by its group, its private creator and
 * its element number in the reserved block. The reader does not depend on the
 * block number (xx) that the creator reserved in the source file.
 *
 * It reads two forms of a naturalized dataset:
 *
 * 1. The block form of dcmjs 1.0. The creator and its elements are one key:
 *    `dataset['7053:Philips PET Private Group'] = { creator, reservedBlock: 0x10,
 *    x09: [1.88] }`. The block is an ordinary property, so it survives a
 *    spread, `JSON.stringify` and a clone. The 8-digit hex keys of dcmjs 1.0
 *    are non-enumerable aliases, which those copies lose, so do not read them.
 * 2. The hex-key form of dcmjs 0.x and of other naturalizers: the creator under
 *    `gggg00xx` (xx from 0x10 to 0xFF) and the element under `ggggxxEE`. The
 *    reader finds the xx whose creator matches, then reads `ggggxxEE`.
 *
 * Matching rules:
 * - The creator matches exactly (case-sensitive), after the removal of leading
 *   spaces and of trailing spaces and NUL bytes, on both sides. dcmjs keys the
 *   block with the same trimmed text and keeps its case.
 * - A creator value can be a string or a list of one string.
 * - The block key and the hex keys can be upper or lower case; the element key
 *   in a block is `xEE` in upper or lower case.
 * - The block form wins when both forms hold the element.
 *
 * @param dataset - a naturalized dataset or sequence item
 * @param group - the odd group, `0x7053` or `'7053'`
 * @param creator - the private creator text, `'Philips PET Private Group'`
 * @param element - the element number in the block, `0x09` or `'09'`
 * @returns the raw value, for example `[1.88]`, or `undefined` when the
 *   creator or the element is absent. Apply `asArrayFirst` or a number parser.
 */
export function getPrivateTagValue<T = unknown>(
  dataset: object | null | undefined,
  group: number | string,
  creator: string,
  element: number | string
): T | undefined {
  const location = findPrivateTag(dataset, group, creator, element);
  return location
    ? (location.container[location.key] as T | undefined)
    : undefined;
}
