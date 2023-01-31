import ICamera from './ICamera';
import Point2 from './Point2';
import Point3 from './Point3';
import ViewportInputOptions from './ViewportInputOptions';
import { ActorEntry } from './IActor';
import ViewportType from '../enums/ViewportType';

/**
 * Viewport interface for cornerstone viewports
 */
interface IViewport {
  /** unique identifier of the viewport */
  id: string;
  /** renderingEngineId the viewport belongs to */
  renderingEngineId: string;
  /** viewport type, can be ORTHOGRAPHIC or STACK for now */
  type: ViewportType;
  /** canvas associated to the viewport */
  canvas: HTMLCanvasElement;
  /** public DOM element associated to the viewport */
  element: HTMLDivElement;
  /** sx of the viewport on the offscreen canvas (if rendering using GPU) */
  sx: number;
  /** sy of the viewport on the offscreen canvas (if rendering using GPU) */
  sy: number;
  /** width of the viewport on the offscreen canvas (if rendering using GPU) */
  sWidth: number;
  /** height of the viewport on the offscreen canvas (if rendering using GPU) */
  sHeight: number;
  /** actors rendered in the viewport*/
  _actors: Map<string, any>;
  /** viewport default options including the axis, and background color  */
  defaultOptions: any;
  /** viewport options */
  options: ViewportInputOptions;
  /** Suppress events */
  suppressEvents: boolean;
  /** if the viewport has been disabled */
  isDisabled: boolean;
  /** frameOfReferenceUID the viewport's default actor is rendering */
  getFrameOfReferenceUID: () => string;
  /** method to convert canvas to world coordinates */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /** method to convert world to canvas coordinates */
  worldToCanvas: (worldPos: Point3) => Point2;
  /** get the first actor */
  getDefaultActor(): ActorEntry;
  /** returns all the actor entires for a viewport which is an object containing actor and its uid */
  getActors(): Array<ActorEntry>;
  /** returns specific actor by its uid */
  getActor(actorUID: string): ActorEntry;
  /** returns specific actor uid by array index */
  getActorUIDByIndex(index: number): string;
  /** returns specific actor by array index */
  getActorByIndex(index: number): ActorEntry;
  /** set and overwrite actors in a viewport */
  setActors(actors: Array<ActorEntry>): void;
  /** add actors to the list of actors */
  addActors(actors: Array<ActorEntry>): void;
  /** add one actor */
  addActor(actorEntry: ActorEntry): void;
  /** remove all actors from the viewport */
  removeAllActors(): void;
  /** remove array of uids */
  removeActors(actorUIDs: Array<string>): void;
  /** returns the renderingEngine instance the viewport belongs to */
  getRenderingEngine(): any;
  /** returns the vtkRenderer (for GPU rendering) of the viewport */
  getRenderer(): void;
  /** triggers render for all actors in the viewport */
  render(): void;
  /** set options for the viewport */
  setOptions(options: ViewportInputOptions, immediate: boolean): void;
  /** reset camera and options*/
  reset(immediate: boolean): void;
  /** returns the canvas */
  getCanvas(): HTMLCanvasElement;
  /** returns camera object */
  getCamera(): ICamera;
  /** returns the parallel zoom relative to the default (eg returns 1 after reset) */
  getZoom(): number;
  /** Sets the relative zoom - set to 1 to reset it */
  setZoom(zoom: number, storeAsInitialCamera?: boolean);
  /** Gets the canvas pan value */
  getPan(): Point2;
  /** Sets the canvas pan value */
  setPan(pan: Point2, storeAsInitialCamera?: boolean);
  /** sets the camera */
  setCamera(cameraInterface: ICamera, storeAsInitialCamera?: boolean): void;
  /** whether the viewport has custom rendering */
  customRenderViewportToCanvas: () => unknown;
  _getCorners(bounds: Array<number>): Array<number>[];
}

/**
 * Public Interface for viewport input to get enabled/disabled or set
 */
type PublicViewportInput = {
  /** HTML element in the DOM */
  element: HTMLDivElement;
  /** unique id for the viewport in the renderingEngine */
  viewportId: string;
  /** type of the viewport */
  type: ViewportType;
  /** options for the viewport */
  defaultOptions?: ViewportInputOptions;
};

type NormalizedViewportInput = {
  /** HTML element in the DOM */
  element: HTMLDivElement;
  /** unique id for the viewport in the renderingEngine */
  viewportId: string;
  /** type of the viewport */
  type: ViewportType;
  /** options for the viewport */
  defaultOptions: ViewportInputOptions;
};

type InternalViewportInput = {
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  viewportId: string;
  type: ViewportType;
  defaultOptions: ViewportInputOptions;
};

type ViewportInput = {
  id: string;
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  renderingEngineId: string;
  type: ViewportType;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
};

export type {
  IViewport,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
};
