import { vtkCamera } from 'vtk.js/Sources/Rendering/Core/Camera';
import { ICamera, ViewportInput, ActorEntry } from '../types';
import RenderingEngine from './RenderingEngine';
import { ViewportInputOptions, Point2, Point3 } from '../types';
import { vtkSlabCamera } from './vtkClasses';
/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
declare class Viewport {
    readonly uid: string;
    readonly sceneUID?: string;
    readonly renderingEngineUID: string;
    readonly type: string;
    readonly canvas: HTMLCanvasElement;
    sx: number;
    sy: number;
    sWidth: number;
    sHeight: number;
    _actors: Map<string, any>;
    readonly defaultOptions: any;
    options: ViewportInputOptions;
    constructor(props: ViewportInput);
    getFrameOfReferenceUID: () => string;
    canvasToWorld: (canvasPos: Point2) => Point3;
    worldToCanvas: (worldPos: Point3) => Point2;
    getIntensityFromWorld(point: Point3): number;
    getDefaultActor(): ActorEntry;
    getActors(): Array<ActorEntry>;
    getActor(actorUID: string): ActorEntry;
    setActors(actors: Array<ActorEntry>): void;
    addActors(actors: Array<ActorEntry>): void;
    addActor(actorEntry: ActorEntry): void;
    removeAllActors(): void;
    /**
     * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
     *
     * @returns {RenderingEngine} The RenderingEngine instance.
     */
    getRenderingEngine(): RenderingEngine;
    /**
     * @method getRenderer Returns the `vtkRenderer` responsible for rendering the `Viewport`.
     *
     * @returns {object} The `vtkRenderer` for the `Viewport`.
     */
    getRenderer(): any;
    /**
     * @method render Renders the `Viewport` using the `RenderingEngine`.
     */
    render(): void;
    /**
     * @method setOptions Sets new options and (TODO) applies them.
     *
     * @param {ViewportInputOptions} options The viewport options to set.
     * @param {boolean} [immediate=false] If `true`, renders the viewport after the options are set.
     */
    setOptions(options: ViewportInputOptions, immediate?: boolean): void;
    /**
     * @method getBounds gets the visible bounds of the viewport
     *
     * @param {any} bounds of the viewport
     */
    getBounds(): any;
    /**
     * @method reset Resets the options the `Viewport`'s `defaultOptions`.`
     *
     * @param {boolean} [immediate=false] If `true`, renders the viewport after the options are reset.
     */
    reset(immediate?: boolean): void;
    resetCamera(): boolean;
    /**
     * @method getCanvas Gets the target ouput canvas for the `Viewport`.
     *
     * @returns {HTMLCanvasElement}
     */
    getCanvas(): HTMLCanvasElement;
    /**
     * @method getActiveCamera Gets the active vtkCamera for the viewport.
     *
     * @returns {object} the vtkCamera.
     */
    getVtkActiveCamera(): vtkCamera | vtkSlabCamera;
    getCamera(): ICamera;
    setCamera(cameraInterface: ICamera): void;
    private _getWorldDistanceViewUpAndViewRight;
    _getCorners(bounds: Array<number>): Array<number>[];
}
export default Viewport;
