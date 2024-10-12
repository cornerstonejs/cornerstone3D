/**
 * The Image Drop Area represents any source of images not native to
 * Cornerstone or its existing image loaders. For example, your image source
 * may be a proprierary URL format, offline local storage or Websockets.
 *
 * For this file to achieve its intended goal, it should *not* import any
 * Cornerstone code, but it may import the dicomParser.
 */

import dicomParser from 'dicom-parser';
import type { AddLogFn } from './logArea';

const SOP_INSTANCE_UID_TAG = 'x00080018';
const SERIES_INSTANCE_UID_TAG = 'x0020000e';

function createImageDropArea(logFn: AddLogFn) {
  const area = document.createElement('div');
  area.id = 'image-drop-area';
  area.style.width = '500px';
  area.style.height = '300px';
  area.style.background = 'lightblue';
  area.style.margin = '5px';
  area.style.padding = '5px';

  const p = document.createElement('p');
  p.appendChild(
    document.createTextNode(
      'Drop instances or series here to load them. Click on a series name to render it in Cornerstone.'
    )
  );
  area.appendChild(p);

  const seriesDiv = document.createElement('div');
  area.appendChild(seriesDiv);

  const bytes: Record<string, ArrayBuffer> = {};
  const series: Record<string, string[]> = {};

  // This particular getInstanceBytes doesn't have to be async, but often, it will be.
  const getInstanceBytes = (sopInstanceUid: string): Promise<ArrayBuffer> => {
    if (sopInstanceUid in bytes) {
      return Promise.resolve(bytes[sopInstanceUid]);
    } else {
      return Promise.reject('SOP instance UID not present in image drop area');
    }
  };

  let emit = (sopInstanceUids: string[]) => {};
  const setEmit = (newEmit: typeof emit) => {
    emit = newEmit;
  };

  const redisplay = () => {
    seriesDiv.replaceChildren();
    Object.entries(series).forEach(([series, instances]) => {
      const div = document.createElement('div');
      div.appendChild(
        document.createTextNode(`${series}: ${instances.length} instances.`)
      );
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => {
        emit(instances);
      });
      seriesDiv.append(div);
    });
  };

  area.ondragover = (event) => event.preventDefault();
  area.addEventListener('drop', async (event) => {
    event.preventDefault();

    const files: File[] = [];
    if (event.dataTransfer?.items?.length) {
      for (let i = 0; i < event.dataTransfer.items.length; ++i) {
        const item = event.dataTransfer.items[i];
        if (item.kind === 'file') {
          files.push(item.getAsFile()!);
        }
      }
    } else {
      for (let i = 0; i < (event.dataTransfer?.files?.length ?? 0); ++i) {
        files.push(event.dataTransfer!.files[i]);
      }
    }

    for (let i = 0; i < files.length; ++i) {
      try {
        const buffer = await files[i].arrayBuffer();
        const dataset = dicomParser.parseDicom(new Uint8Array(buffer));

        const sopInstanceUid = dataset.string(SOP_INSTANCE_UID_TAG);
        if (!sopInstanceUid) {
          throw new Error('DICOM instance must have a SOP instance UID');
        }
        bytes[sopInstanceUid] = buffer;

        let seriesInstanceUid = dataset.string(SERIES_INSTANCE_UID_TAG);
        // This is a bit of a hack: if the dataset has no series UID, use the
        // sop instance UID as a series UID.
        if (!seriesInstanceUid) {
          seriesInstanceUid = sopInstanceUid;
        }
        if (!(seriesInstanceUid in series)) {
          series[seriesInstanceUid] = [];
        }
        series[seriesInstanceUid].push(sopInstanceUid);

        redisplay();
      } catch (e) {
        logFn('Failed to parse DICOM: ', e);
      }
    }
  });

  return {
    area,
    getInstanceBytes,
    setEmit,
  };
}

export default createImageDropArea;
