// Fixed length array template type. Maybe we should hoist this somewhere else.
type ArrayLengthMutationKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift';
type FixedLengthArray<T, L extends number, TObj = [T, ...Array<T>]> = Pick<
  TObj,
  Exclude<keyof TObj, ArrayLengthMutationKeys>
> & {
  readonly length: L;
  [I: number]: T;
  [Symbol.iterator]: () => IterableIterator<T>;
};

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
  page: IPoint;
  client: IPoint;
  canvas: IPoint;
  world: I3dPoint;
};

type IPoint = FixedLengthArray<number, 2>;
type I3dPoint = FixedLengthArray<number, 3>;

export default ICornerstoneToolsEventDetail;

export { ICornerstoneToolsEventDetail, IPoints, IPoint, I3dPoint };
