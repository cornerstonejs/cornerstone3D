/** The round constants of SHA-256. */
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The first hash value of SHA-256. */
const INITIAL_HASH = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * The words of a string padded as SHA-256 pads its message. Each UTF-16 code
 * unit of the string is two bytes, the high byte first, so the digest needs
 * no text encoder and differs for any two strings.
 */
function getPaddedWords(text: string): Uint32Array {
  const byteLength = text.length * 2;
  const words = new Uint32Array(Math.ceil((byteLength + 9) / 64) * 16);

  for (let index = 0; index < text.length; index++) {
    words[index >> 1] |= text.charCodeAt(index) << (index % 2 ? 0 : 16);
  }

  words[byteLength >> 2] |= 0x80 << (byteLength % 4 ? 8 : 24);
  words[words.length - 2] = Math.floor(byteLength / 0x20000000);
  words[words.length - 1] = byteLength * 8;

  return words;
}

/**
 * The SHA-256 digest of a string, as 64 hexadecimal digits. The string is
 * read as UTF-16 code units, two bytes each, the high byte first. A digest
 * that two different strings share is not known, so it names a set of
 * values where a short hash such as `fnv1aHash` can give two sets one name.
 */
export default function sha256(text: string): string {
  const words = getPaddedWords(text);
  const hash = new Uint32Array(INITIAL_HASH);
  const schedule = new Uint32Array(64);

  for (let block = 0; block < words.length; block += 16) {
    for (let round = 0; round < 64; round++) {
      if (round < 16) {
        schedule[round] = words[block + round];
        continue;
      }

      const early = schedule[round - 15];
      const late = schedule[round - 2];

      schedule[round] =
        schedule[round - 16] +
        (rotateRight(early, 7) ^ rotateRight(early, 18) ^ (early >>> 3)) +
        schedule[round - 7] +
        (rotateRight(late, 17) ^ rotateRight(late, 19) ^ (late >>> 10));
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let round = 0; round < 64; round++) {
      const first =
        (h +
          (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) +
          ((e & f) ^ (~e & g)) +
          ROUND_CONSTANTS[round] +
          schedule[round]) >>>
        0;
      const second =
        ((rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) >>>
        0;

      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }

    hash[0] += a;
    hash[1] += b;
    hash[2] += c;
    hash[3] += d;
    hash[4] += e;
    hash[5] += f;
    hash[6] += g;
    hash[7] += h;
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join(
    ''
  );
}
