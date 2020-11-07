function createFloat32SharedArray(length) {
  const sharedArrayBuffer = new SharedArrayBuffer(length * 4);

  return new Float32Array(sharedArrayBuffer);
}

function createUint8SharedArray(length) {
  const sharedArrayBuffer = new SharedArrayBuffer(length);

  return new Uint8Array(sharedArrayBuffer);
}

export { createUint8SharedArray, createFloat32SharedArray };
