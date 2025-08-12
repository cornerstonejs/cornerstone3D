import parseImageId from './parseImageId';
import fileManager from './fileManager';
import { readFile } from 'node:fs/promises';

function toArrayBufferFromBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

function toArrayBufferFromView(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

async function loadFileRequest(uri: string): Promise<ArrayBuffer> {
  const parsedImageId = parseImageId(uri);
  const fileIndex = parseInt(parsedImageId.url, 10);
  const file: any = fileManager.get(fileIndex) as any;

  if (file == null) {
    throw new Error(`No file found in fileManager for index ${fileIndex}`);
  }

  // If a filesystem path (string) was stored, read it via fs
  if (typeof file === 'string') {
    const buf = await readFile(file);
    return toArrayBufferFromBuffer(buf);
  }

  // If it's already an ArrayBuffer
  if (file instanceof ArrayBuffer) {
    return file as ArrayBuffer;
  }

  // If it's a Node Buffer
  if (
    typeof Buffer !== 'undefined' &&
    Buffer.isBuffer &&
    Buffer.isBuffer(file)
  ) {
    return toArrayBufferFromBuffer(file as Buffer);
  }

  // If it's a typed array / DataView
  if (ArrayBuffer.isView && ArrayBuffer.isView(file)) {
    return toArrayBufferFromView(file as ArrayBufferView);
  }

  // If it's Blob-like with arrayBuffer() (Node 18+ or web Blob)
  if (typeof file.arrayBuffer === 'function') {
    return (await file.arrayBuffer()) as ArrayBuffer;
  }

  throw new Error('Unsupported file type for Node loadFileRequest');
}

export default loadFileRequest;
