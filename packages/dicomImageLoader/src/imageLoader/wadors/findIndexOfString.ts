function checkToken(token, data, dataOffset): boolean {
  if (dataOffset + token.length > data.length) {
    return false;
  }

  let endIndex = dataOffset;

  for (let i = 0; i < token.length; i++) {
    if (token[i] !== data[endIndex++]) {
      return false;
    }
  }

  return true;
}

function stringToUint8Array(str: string): Uint8Array {
  const uint = new Uint8Array(str.length);

  for (let i = 0, j = str.length; i < j; i++) {
    uint[i] = str.charCodeAt(i);
  }

  return uint;
}

/**
 * The index of the first place at or after `offset` where the bytes of a
 * string (each character taken as one byte) start in the data, or -1. The
 * search for the first byte of the string between candidates is the native
 * `indexOf` of the typed array, so a response of a frame is not walked byte
 * by byte in JavaScript (the multipart parser looks for the closing boundary
 * of every frame). A string that ends past the data is not found. A
 * negative offset counts as 0; an offset that is not a whole number, and an
 * empty string, find nothing.
 */
function findIndexOfString(
  data: Uint8Array,
  str: string,
  offset?: number
): number {
  const start = offset || 0;
  const token = stringToUint8Array(str);

  if (!token.length || !Number.isInteger(start)) {
    return -1;
  }

  const lastStart = data.length - token.length;
  let index = Math.max(start, 0);

  while (index <= lastStart) {
    index = data.indexOf(token[0], index);

    if (index === -1 || index > lastStart) {
      return -1;
    }

    if (checkToken(token, data, index)) {
      return index;
    }

    index++;
  }

  return -1;
}
export default findIndexOfString;
