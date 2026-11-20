import {
  Enums,
  RenderingEngine,
  getRenderingEngine,
  type Types,
} from '@cornerstonejs/core';

const MAIN_ENGINE_ID = 'main';

let mainEngine;

export function otherEngineInput(
  otherEngine: RenderingEngine,
  currentEngine: RenderingEngine,
  element: HTMLDivElement
) {
  otherEngine.enableElement({
    viewportId: 'unrelated',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  return currentEngine.getViewport('unrelated') as Types.IVolumeViewport;
}

export function engineOfAnotherId(element: HTMLDivElement) {
  const left = new RenderingEngine('left');

  left.enableElement({
    viewportId: 'side',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  return getRenderingEngine('right').getViewport(
    'side'
  ) as Types.IVolumeViewport;
}

function inputsFor(element: HTMLDivElement) {
  return [
    {
      viewportId: 'helper',
      type: Enums.ViewportType.VOLUME_3D,
      element,
    },
  ];
}

export function inputsFromAHelper(element: HTMLDivElement) {
  const engine = getRenderingEngine(MAIN_ENGINE_ID);

  engine.setViewports(inputsFor(element));

  return engine.getViewport('helper') as Types.IVolumeViewport;
}

export function setUpMain(element: HTMLDivElement) {
  mainEngine = new RenderingEngine(MAIN_ENGINE_ID);

  const viewportInputArray = [
    {
      viewportId: 'volume',
      type: Enums.ViewportType.VOLUME_3D,
      element,
    },
  ];

  mainEngine.setViewports(viewportInputArray);
}

export function volumeOfMain() {
  const engine = getRenderingEngine(MAIN_ENGINE_ID);

  return engine.getViewport('volume') as Types.IVolumeViewport;
}

export function sameBinding(
  engine: RenderingEngine,
  element: HTMLDivElement
) {
  const viewportInput = {
    viewportId: 'local',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  };

  engine.enableElement(viewportInput);

  return engine.getViewport('local') as Types.IVolumeViewport;
}
