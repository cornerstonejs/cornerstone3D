import { unzip } from 'fflate';

const zipBytesCache = new Map<string, Uint8Array>();

export async function extractZipEntry(zipUrl: string, entryName: string) {
  let zipBytes = zipBytesCache.get(zipUrl);

  if (!zipBytes) {
    const zipCache = await caches.open('onnx-zip');
    const cachedZip = await zipCache.match(zipUrl);

    if (cachedZip) {
      zipBytes = new Uint8Array(await cachedZip.arrayBuffer());
    } else {
      console.debug(`Downloading ${zipUrl.split('/').pop()} for ONNX models`);

      const response = await fetch(zipUrl);

      if (!response.ok) {
        throw new Error(`Failed to download ${zipUrl}: ${response.statusText}`);
      }

      zipBytes = new Uint8Array(await response.arrayBuffer());
      await zipCache.put(zipUrl, new Response(zipBytes));
    }

    zipBytesCache.set(zipUrl, zipBytes);
  }

  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(zipBytes, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(data);
      });
    }
  );

  const entry = files[entryName];

  if (!entry) {
    throw new Error(`Entry "${entryName}" not found in ${zipUrl}`);
  }

  return entry.slice().buffer;
}
