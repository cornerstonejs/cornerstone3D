interface ICornerstoneToolsEventDetail {
  renderingEngineUID: string;
  sceneUID: string;
  viewportUID: string;

  event: object;
  camera: object;
  element: HTMLElement;
  //
  startPoints: IPoints;
  lastPoints: IPoints;
  currentPoints: IPoints;
  deltaPoints: IPoints;
  eventName: string;
}

interface IPoints {
  page: IPoint;
  client: IPoint;
  canvas: IPoint;
  world: I3dPoint;
}

interface IPoint {
  x: number;
  y: number;
}

interface I3dPoint {
  x: number;
  y: number;
  z: number;
}

export default ICornerstoneToolsEventDetail;

export { ICornerstoneToolsEventDetail, IPoints, IPoint, I3dPoint };
