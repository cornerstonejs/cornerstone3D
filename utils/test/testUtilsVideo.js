import { metaData } from '@cornerstonejs/core';

/**
 * A WebM video of 64 by 48 pixels and 20 frames at 10 frames per second.
 * The luma rises with the column and the frame, the blue difference with the
 * row and the red difference with the frame, so each frame and each pixel
 * of a frame differ. It was made with ffmpeg from a lavfi colour source.
 */
const VIDEO_BASE64 =
  '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' +
  '/7Z3Jf9nuv/l1lPF8tf6bSUE/LX+m0lBPy1/ptJQT8tf6bSUE/LX+m0lBPy1/ptJQT8tf6bSUE/L' +
  'X+m0lBPy1/ptJQT8tf6bSUE/LX+m0lBPy1/ptJQT8tf6bSUE/LX+m0lBPwwAAAAAAAAAAAAAER//' +
  '7JHeUP979//pyrJMf737//TlWSY/3v3/+nKskx/vfv/9OVZJj/e/f/6cqyTH+9+////4kkAAAACj' +
  'QMaBAryAgkmDQgAD8AL2ADgkHBgAAAAgAAAkn////7XTXqP/uv/l1lPF8tf6bSUE/LX+m0lBPy1/' +
  'ptJQT8tf6bSUE/LX+m0lBPy1/ptJQT8tf6bSUE/LX+m0lBPy1/ptJQT8tf6bSUE/LX+m0lBPy1/p' +
  'tJQT8tf6bSUE/LX+m0lBPwwAAAAAAAAAAAAAER//7JHeUP979//pyrJMf737//TlWSY/3v3/+nKs' +
  'kx/vfv/9OVZJj/e/f/6cqyTH+9+////6HkAAAACjQMaBAyCAgkmDQgAD8AL2ADgkHBgAAAAgAAAk' +
  'n////7UPJKCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02k' +
  'oJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCfhgAAAAAAAAAAAAA' +
  'Ij//2SO8of737//TlWSY/3v3/+nKskx/vfv/9OVZJj/e/f/6cqyTH+9+//05VkmP979////23kAA' +
  'AACjQMaBA4SAgkmDQgAD8AL2ADgkHBgAAAAgAAAkn////7QgWgWPlr/TaSgn5a/02koJ+Wv9NpKC' +
  'flr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCf' +
  'lr/TaSgn5a/02koJ+Wv9NpKCfhgAAAAAAAAAAAAAIj//2SO8of737//TlWSY/3v3/+nKskx/vfv/' +
  '9OVZJj/e/f/6cqyTH+9+//05VkmP979////4c+AAAACjQMaBA+iAgkmDQgAD8AL2ADgkHBgAAAAg' +
  'AAAkn////7L8pLdfdf/LrKeL5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a' +
  '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' +
  '//TlWSY/3v3////0H0AAAACjQMaBB2yAgkmDQgAD8AL2ADgkHBgAAAAgAAAkn////5u0L/s91/8u' +
  'sp4vlr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+Wv9Np' +
  'KCflr/TaSgn5a/02koJ+Wv9NpKCflr/TaSgn5a/02koJ+GAAAAAAAAAAAAAAiP//ZI7yh/vfv/9O' +
  'VZJj/e/f/6cqyTH+9+//05VkmP979//pyrJMf737//TlWSY/3v3////1FCAAAAAcU7trQXe7j7OB' +
  'ALeK94EB8YIBq/CBA7uPs4Fkt4r3gQHxggGr8IHIu5Czgci3i/eBAfGCAavwggGOu5GzggEst4v3' +
  'gQHxggGr8IICVbuRs4IBkLeL94EB8YIBq/CCAx27kbOCAfS3i/eBAfGCAavwggPmu5GzggJYt4v3' +
  'gQHxggGr8IIErruRs4ICvLeL94EB8YIBq/CCBXe7kbOCAyC3i/eBAfGCAavwggZAu5GzggOEt4v3' +
  'gQHxggGr8IIHCbuRs4ID6LeL94EB8YIBq/CCB9K7kbOCBEy3i/eBAfGCAavwggibu5GzggSwt4v3' +
  'gQHxggGr8IIJZLuRs4IFFLeL94EB8YIBq/CCCi27kbOCBXi3i/eBAfGCAavwggr2u5GzggXct4v3' +
  'gQHxggGr8IILv7uRs4IGQLeL94EB8YIBq/CCDIi7kbOCBqS3i/eBAfGCAavwgg1Ru5GzggcIt4v3' +
  'gQHxggGr8IIOGruRs4IHbLeL94EB8YIBq/CCDuM=';

/** The size, the frame rate and the number of frames of the test video. */
const TEST_VIDEO = {
  width: 64,
  height: 48,
  fps: 10,
  numberOfFrames: 20,
  imageId: 'wadors:https://test.video/studies/1/series/2/instances/3/frames/1',
};

/** Makes an object URL of the test video. */
function createTestVideoUrl() {
  const binary = atob(VIDEO_BASE64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
}

/**
 * Adds a metadata provider for the test video image id: the rendered URL,
 * the series modality, the cine frame rate and the image plane size. The
 * legacy and the next video viewports both read these.
 *
 * @returns The object URL of the video, to revoke after the test.
 */
function addTestVideoMetadata(imageId = TEST_VIDEO.imageId) {
  const url = createTestVideoUrl();
  const base = imageId.replace(/\/frames\/\d+$/, '');
  const modules = {
    imageUrlModule: { rendered: url },
    generalSeriesModule: { modality: 'XC', Modality: 'XC' },
    cineModule: {
      cineRate: TEST_VIDEO.fps,
      numberOfFrames: TEST_VIDEO.numberOfFrames,
    },
    instance: { NumberOfFrames: TEST_VIDEO.numberOfFrames },
    imagePlaneModule: {
      rows: TEST_VIDEO.height,
      columns: TEST_VIDEO.width,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
    },
  };

  metaData.addProvider((type, id) => {
    if (typeof id !== 'string' || !id.startsWith(base)) {
      return;
    }

    return modules[type];
  }, 20000);

  return url;
}

/**
 * Resolves when the condition is true on an animation frame, or rejects
 * after the timeout.
 */
function waitFor(condition, timeout = 5000) {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) {
        resolve();
      } else if (performance.now() - start > timeout) {
        reject(new Error('waitFor timed out'));
      } else {
        requestAnimationFrame(check);
      }
    };

    check();
  });
}

/** Resolves after the given number of animation frames. */
function animationFrames(count = 2) {
  return new Promise((resolve) => {
    const step = (left) =>
      left ? requestAnimationFrame(() => step(left - 1)) : resolve();

    step(count);
  });
}

export {
  TEST_VIDEO,
  createTestVideoUrl,
  addTestVideoMetadata,
  waitFor,
  animationFrames,
};
