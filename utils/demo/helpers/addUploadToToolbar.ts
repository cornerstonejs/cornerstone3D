import { getRenderingEngine } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';

import createElement, { configElement } from './createElement';
import addButtonToToolbar from './addButtonToToolbar';
import { renderingEngineId, viewportId } from './constants';

interface configUpload extends configElement {
  id?: string;
  title?: string;
  container?: HTMLElement;
  onChange?: (files: FileList) => void;
  input?: configElement;
}

export function addUploadToToolbar(config: configUpload = {}): void {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');
  config.onChange ||= onUpload;
  //
  const fnClick = () => {
    //
    const elInput = <HTMLInputElement>createElement({
      merge: config.input,
      tag: 'input',
      attr: {
        type: 'file',
        multiple: true,
        hidden: true,
      },
      event: {
        change: (evt: Event) => {
          const files = (evt.target as HTMLInputElement).files;

          config.onChange(files);

          elInput.remove();
        },
        cancel: () => {
          elInput.remove();
        },
      },
    });

    document.body.appendChild(elInput);

    elInput.click();
  };

  //
  addButtonToToolbar({
    merge: config,
    title: config.title || 'Upload',
    onClick: fnClick,
  });
}

export let imageIds = new Array<string>();
export let loadImageListener = (_viewportInfo) => {
  console.warn("Loaded", imageIds.length, "images");
};

export function onUpload(files) {
  imageIds = [...files].map((file) =>
    dicomImageLoader.wadouri.fileManager.add(file)
  );
  loadAndViewImages(imageIds);
}

export function setImageIds(newImageIds: string[]) {
  imageIds = newImageIds;
}

export function setLoadImageListener(listener) {
  loadImageListener = listener;
}

export function getViewport(viewportInfo?) {
  const renderingEngine = getRenderingEngine(viewportInfo?.renderingEngineId || renderingEngineId);

      // Get the volume viewport
  const viewport = renderingEngine.getViewport(
    viewportInfo?.viewportId || viewportId
  );
  return viewport;
}

export function loadAndViewImages(imageIds, viewportInfo?) {
  // Set the stack on the viewport
  setImageIds(imageIds);

  const viewport = getViewport(viewportInfo);

  viewport.setStack(imageIds).then(() => {
    // Set the VOI of the stack
    // viewport.setProperties({ voiRange: ctVoiRange });
    // Render the image
    viewport.render();

    loadImageListener(viewportInfo);
  });
}

// this function gets called once the user drops the file onto the div
export function handleFileSelect(evt) {
  evt.stopPropagation();
  evt.preventDefault();

  // Get the FileList object that contains the list of files that were dropped
  const files = [...evt.dataTransfer.files];

  // this UI is only built for a single file so just dump the first one
  imageIds = files.map((file) =>
    dicomImageLoader.wadouri.fileManager.add(file)
  );
  loadAndViewImages(imageIds);
}


export default addUploadToToolbar;
