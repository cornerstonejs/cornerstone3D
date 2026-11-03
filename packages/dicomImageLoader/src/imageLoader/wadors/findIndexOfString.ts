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

function findIndexOfString(
  data: Uint8Array,
  str: string,
  offset?: number
): number {
  offset = Math.max(offset || 0, 0);

  const token = stringToUint8Array(str);

  if (token.length === 0) {
    return -1;
  }

  // Candidates come from the engine's native TypedArray search rather than a
  // script loop over every byte; each is then confirmed byte for byte. Same
  // contract (first occurrence at or after offset). The closing boundary sits at
  // the END of each frame body, so the script loop walked the whole payload: on
  // a 321-slice CBCT that measured about 1.1 s of main-thread time.
  let i = data.indexOf(token[0], offset);

  while (i !== -1) {
    if (checkToken(token, data, i)) {
      return i;
    }
    i = data.indexOf(token[0], i + 1);
  }

  return -1;
}
export default findIndexOfString;
