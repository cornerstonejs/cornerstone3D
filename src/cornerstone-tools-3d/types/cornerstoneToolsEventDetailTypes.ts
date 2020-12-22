
import {Point2, Point3} from './points'

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

type IPoints = {
  page: Point2;
  client: Point2;
  canvas: Point2;
  world: Point3;
};


export default ICornerstoneToolsEventDetail;

export { ICornerstoneToolsEventDetail, IPoints};
