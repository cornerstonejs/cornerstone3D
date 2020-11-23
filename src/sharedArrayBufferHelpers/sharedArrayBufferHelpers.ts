function createFloat32SharedArray(length: number): Float32Array {
  const sharedArrayBuffer = new SharedArrayBuffer(length * 4);

  return new Float32Array(sharedArrayBuffer);
}

function createUint8SharedArray(length: number): Uint8Array {
  const sharedArrayBuffer = new SharedArrayBuffer(length);

  return new Uint8Array(sharedArrayBuffer);
}

export { createUint8SharedArray, createFloat32SharedArray };
