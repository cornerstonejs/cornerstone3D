import { describe, it, expect } from '@jest/globals';
import findIndexOfString from '../imageLoader/wadors/findIndexOfString';

/**
 * The search of 5.18.3 and of the 6.0 betas, as it was: a JavaScript loop
 * over every byte of the data from the offset, kept here to compare with
 * (row 350).
 */
function checkTokenByteLoop(token, data, dataOffset): boolean {
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

function stringToUint8ArrayByteLoop(str: string): Uint8Array {
  const uint = new Uint8Array(str.length);

  for (let i = 0, j = str.length; i < j; i++) {
    uint[i] = str.charCodeAt(i);
  }

  return uint;
}

function findIndexOfStringByteLoop(
  data: Uint8Array,
  str: string,
  offset?: number
): number {
  offset = offset || 0;

  const token = stringToUint8ArrayByteLoop(str);

  for (let i = offset; i < data.length; i++) {
    if (token[0] === data[i]) {
      if (checkTokenByteLoop(token, data, i)) {
        return i;
      }
    }
  }

  return -1;
}

function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

const BOUNDARY = '--a1b2c3d4';

/** A multipart response of one part with pixel data between the boundaries. */
function multipart(pixelData: string, closing = `${BOUNDARY}--`): Uint8Array {
  return bytesOf(
    `${BOUNDARY}\r\nContent-Type: application/octet-stream\r\n\r\n${pixelData}\r\n${closing}`
  );
}

/** A pseudo random generator with a seed, so that a failure repeats. */
function random(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state / 2147483648;
  };
}

describe('findIndexOfString finds the index that the byte loop of 5.x found (row 350)', () => {
  const cases: Array<[string, Uint8Array, string, number | undefined]> = [
    ['the boundary at the start', bytesOf(`${BOUNDARY}rest`), BOUNDARY, 0],
    ['the boundary at the end', bytesOf(`abc${BOUNDARY}`), BOUNDARY, 0],
    ['no boundary', bytesOf('abc-def--ghi'), BOUNDARY, 0],
    [
      'a part of the boundary at the end',
      bytesOf(`abc${BOUNDARY.slice(0, 6)}`),
      BOUNDARY,
      0,
    ],
    [
      'the first byte of the boundary at the last byte',
      bytesOf('abc-'),
      BOUNDARY,
      0,
    ],
    [
      'first bytes repeated before the boundary',
      bytesOf(`-----${BOUNDARY.slice(2)}x`),
      BOUNDARY,
      0,
    ],
    [
      'an offset before the boundary',
      bytesOf(`xx${BOUNDARY}yy${BOUNDARY}`),
      BOUNDARY,
      1,
    ],
    [
      'an offset at the boundary',
      bytesOf(`xx${BOUNDARY}yy${BOUNDARY}`),
      BOUNDARY,
      2,
    ],
    [
      'an offset past the first boundary',
      bytesOf(`xx${BOUNDARY}yy${BOUNDARY}`),
      BOUNDARY,
      3,
    ],
    ['an offset past the end', bytesOf(`${BOUNDARY}`), BOUNDARY, 40],
    ['an offset at the end', bytesOf(`${BOUNDARY}`), BOUNDARY, 10],
    ['a negative offset', bytesOf(`x${BOUNDARY}`), BOUNDARY, -3],
    ['no offset', bytesOf(`x${BOUNDARY}`), BOUNDARY, undefined],
    ['a fractional offset', bytesOf(`x${BOUNDARY}`), BOUNDARY, 0.5],
    ['an infinite offset', bytesOf(`x${BOUNDARY}`), BOUNDARY, Infinity],
    ['the header end of a response', multipart('pixels'), '\r\n\r\n', 0],
    [
      'the closing boundary of a response after its header',
      multipart('pi-x--els-'),
      BOUNDARY,
      BOUNDARY.length + 1,
    ],
    [
      'a response cut before its closing boundary',
      multipart('pixels', BOUNDARY.slice(0, 4)),
      BOUNDARY,
      BOUNDARY.length + 1,
    ],
    ['a string of one character', bytesOf('abcabc'), 'c', 3],
    ['a string longer than the data', bytesOf('--'), BOUNDARY, 0],
    ['empty data', new Uint8Array(0), BOUNDARY, 0],
    ['an empty string', bytesOf('abc'), '', 0],
    [
      'a character above one byte, taken modulo 256',
      Uint8Array.from([1, 0, 2]),
      String.fromCharCode(256),
      0,
    ],
  ];

  it.each(cases)('for %s', (_name, data, str, offset) => {
    expect(findIndexOfString(data, str, offset)).toBe(
      findIndexOfStringByteLoop(data, str, offset)
    );
  });

  it('for 20,000 random data of four byte values, strings of them and offsets', () => {
    const next = random(350);
    const alphabet = [45, 13, 10, 98];
    const pick = () => alphabet[Math.floor(next() * alphabet.length)];
    const differences = [];

    for (let run = 0; run < 20000; run++) {
      const data = Uint8Array.from({ length: Math.floor(next() * 40) }, pick);
      const str = String.fromCharCode(
        ...Array.from({ length: 1 + Math.floor(next() * 5) }, pick)
      );
      const offset = Math.floor(next() * (data.length + 4)) - 2;
      const found = findIndexOfString(data, str, offset);
      const expected = findIndexOfStringByteLoop(data, str, offset);

      if (found !== expected) {
        differences.push({
          data: Array.from(data),
          str,
          offset,
          found,
          expected,
        });
      }
    }

    expect(differences).toEqual([]);
  });

  it('finds nothing for an empty string at a negative offset, where the byte loop gave the offset back', () => {
    const data = bytesOf('abc');

    expect(findIndexOfStringByteLoop(data, '', -2)).toBe(-2);
    expect(findIndexOfString(data, '', -2)).toBe(-1);
  });
});
