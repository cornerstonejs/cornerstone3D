/**
 * Utilities to extract a single ArrayBufferView from bulk data that may be
 * stored as an array of buffers (e.g. from DICOM stream listeners or
 * compressed frame data), matching the pattern used for compressed pixel
 * data frames.
 */

function asView(buf: ArrayBuffer | ArrayBufferView): ArrayBufferView {
  if (buf instanceof ArrayBuffer) {
    return new Uint8Array(buf);
  }
  return buf as ArrayBufferView;
}

/**
 * Extracts a single ArrayBufferView from a value that may be:
 * - A single ArrayBuffer or ArrayBufferView (returned as-view)
 * - An array of one buffer: returns asView(arr[0])
 * - An array of multiple buffers: concatenates and returns one Uint8Array
 *
 * Use for bulk data that can be delivered as either a single buffer or an
 * array of fragments (e.g. palette LUT, pixel data frame).
 *
 * @param raw - ArrayBuffer, ArrayBufferView, or array of same
 * @returns Single ArrayBufferView, or undefined if raw is not a supported type
 */
export function getSingleBufferFromArray(
  raw: unknown
): ArrayBufferView | undefined {
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    return asView(raw as ArrayBuffer | ArrayBufferView);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const first = raw[0];
  if (
    first === undefined ||
    first === null ||
    (!(first instanceof ArrayBuffer) && !ArrayBuffer.isView(first))
  ) {
    return undefined;
  }
  if (raw.length === 1) {
    return asView(first as ArrayBuffer | ArrayBufferView);
  }
  const views = raw.filter(
    (item): item is ArrayBuffer | ArrayBufferView =>
      item != null && (item instanceof ArrayBuffer || ArrayBuffer.isView(item))
  );
  if (views.length === 0) return undefined;
  const totalLength = views.reduce(
    (sum, v) =>
      sum +
      (v instanceof ArrayBuffer
        ? v.byteLength
        : (v as ArrayBufferView).byteLength),
    0
  );
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const v of views) {
    const view = asView(v);
    out.set(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      offset
    );
    offset += view.byteLength;
  }
  return out;
}
