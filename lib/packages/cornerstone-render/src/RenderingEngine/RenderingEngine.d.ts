import { PublicViewportInput } from '../types';
import VolumeViewport from './VolumeViewport';
import StackViewport from './StackViewport';
import Scene from './Scene';
interface IRenderingEngine {
    uid: string;
    hasBeenDestroyed: boolean;
    offscreenMultiRenderWindow: any;
    offScreenCanvasContainer: any;
    setViewports(viewports: Array<PublicViewportInput>): void;
    resize(): void;
    getScene(uid: string): Scene;
    getScenes(): Array<Scene>;
    getViewport(uid: string): StackViewport | VolumeViewport;
    getViewports(): Array<StackViewport | VolumeViewport>;
    render(): void;
    renderScene(sceneUID: string): void;
    renderScenes(sceneUIDs: Array<string>): void;
    renderViewports(viewportUIDs: Array<string>): void;
    renderViewport(sceneUID: string, viewportUID: string): void;
    renderFrameOfReference(FrameOfReferenceUID: string): void;
    destroy(): void;
    _debugRender(): void;
}
/**
 * A RenderingEngine takes care of the full pipeline of creating viewports and rendering
 * them on a large offscreen canvas and transmitting this data back to the screen. This allows us
 * to leverage the power of vtk.js whilst only using one WebGL context for the processing, and allowing
 * us to share texture memory across on-screen viewports that show the same data.
 *
 * @example
 * Instantiating a rendering engine:
 * ```
 * const renderingEngine = new RenderingEngine('pet-ct-rendering-engine');
 * ```
 *
 * @public
 */
declare class RenderingEngine implements IRenderingEngine {
    readonly uid: string;
    hasBeenDestroyed: boolean;
    /**
     * A hook into VTK's `vtkOffscreenMultiRenderWindow`
     * @member {any}
     */
    offscreenMultiRenderWindow: any;
    readonly offScreenCanvasContainer: any;
    private _scenes;
    private _viewports;
    private _needsRender;
    private _animationFrameSet;
    private _animationFrameHandle;
    /**
     *
     * @param uid - Unique identifier for RenderingEngine
     */
    constructor(uid: string);
    /**
     * Enables the requested viewport and add it to the viewports. It will
     * properly create the Stack viewport or Volume viewport:
     *
     * 1) Checks if the viewport is defined already, if yes, remove it first
     * 2) Calculates a new offScreen canvas with the new requested viewport
     * 3) Adds the viewport
     * 4) If a sceneUID is provided for the viewportInputEntry it will create
     * a Scene for the viewport and add it to the list of scene viewports.
     * 5) If there is an already created scene, it will add the volumeActors
     * to the requested viewport. OffScreen canvas is resized properly based
     *  on the size of the new viewport.
     *
     *
     * @param {Object} viewportInputEntry viewport specifications
     *
     * @returns {void}
     * @memberof RenderingEngine
     */
    enableElement(viewportInputEntry: PublicViewportInput): void;
    /**
     * Disables the requested viewportUID from the rendering engine:
     * 1) It removes the viewport from the the list of viewports
     * 2) remove the renderer from the offScreen render window
     * 3) resetting the viewport to remove the canvas attributes and canvas data
     * 4) resize the offScreen appropriately
     *
     * @param {string} viewportUID viewport UID
     *
     * @returns {void}
     * @memberof RenderingEngine
     */
    disableElement(viewportUID: string): void;
    /**
     * Disables the requested viewportUID from the rendering engine:
     * 1) It removes the viewport from the the list of viewports
     * 2) remove the renderer from the offScreen render window
     * 3) resetting the viewport to remove the canvas attributes and canvas data
     * 4) resize the offScreen appropriately
     *
     * @param {string} viewportUID viewport UID
     *
     * @returns {void}
     * @memberof RenderingEngine
     */
    private _removeViewport;
    /**
     * Add viewport at the correct position on the offScreenCanvas
     *
     * @param {Object} viewportInputEntry viewport definition to construct the viewport
     * @param {number} offScreenCanvasWidth offScreen width
     * @param {number} offScreenCanvasHeight offScreen height
     * @param {number} _xOffset offset from left of offScreen canvas to place the viewport
     *
     * @returns {void}
     * @memberof RenderingEngine
     */
    private _addViewport;
    /**
     * Creates `Scene`s containing `Viewport`s and sets up the offscreen render
     * window to allow offscreen rendering and transmission back to the target
     * canvas in each viewport.
     *
     * @param viewportInputEntries An array of viewport definitions to construct the rendering engine
     * /todo: if don't want scene don't' give uid
     */
    setViewports(viewportInputEntries: Array<PublicViewportInput>): void;
    /**
     * Resizes the offscreen canvas based on the provided canvases
     *
     * @param canvases An array of HTML Canvas
     */
    private _resizeOffScreenCanvas;
    /**
     * Recalculates and updates the viewports location on the offScreen canvas upon its resize
     *
     * @param viewports An array of viewports
     * @param offScreenCanvasWidth new offScreen canvas width
     * @param offScreenCanvasHeight new offScreen canvas height
     *
     * @returns {number} _xOffset the final offset which will be used for the next viewport
     */
    private _resize;
    /**
     * @method resize Resizes the offscreen viewport and recalculates translations to on screen canvases.
     * It is up to the parent app to call the size of the on-screen canvas changes.
     * This is left as an app level concern as one might want to debounce the changes, or the like.
     */
    resize(): void;
    /**
     * Calculates the location of the provided viewport on the offScreenCanvas
     *
     * @param viewports An array of viewports
     * @param offScreenCanvasWidth new offScreen canvas width
     * @param offScreenCanvasHeight new offScreen canvas height
     * @param _xOffset xOffSet to draw
     */
    private _getViewportCoordsOnOffScreenCanvas;
    /**
     * @method getScene Returns the scene, only scenes with SceneUID (not internal)
     * are returned
     * @param {string} sceneUID The UID of the scene to fetch.
     *
     * @returns {Scene} The scene object.
     */
    getScene(sceneUID: string): Scene;
    /**
     * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
     *
     * @returns {Scene} The scene object.
     */
    getScenes(): Array<Scene>;
    /**
     * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
     *
     * @returns {Scene} The scene object.
     */
    removeScene(sceneUID: string): void;
    /**
     * @method _getViewportsAsArray Returns an array of all viewports
     *
     * @returns {Array} Array of viewports.
     */
    private _getViewportsAsArray;
    /**
     * @method getViewport Returns the viewport by UID
     *
     * @returns {StackViewport | VolumeViewport} viewport
     */
    getViewport(uid: string): StackViewport | VolumeViewport;
    /**
     * @method getViewportsContainingVolumeUID Returns the viewport containing the volumeUID
     *
     * @returns {VolumeViewport} viewports
     */
    getViewportsContainingVolumeUID(uid: string): Array<VolumeViewport>;
    /**
     * @method getScenesContainingVolume Returns the scenes containing the volumeUID
     *
     * @returns {Scene} scenes
     */
    getScenesContainingVolume(uid: string): Array<Scene>;
    /**
     * @method getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
     *
     * @returns {Viewport} The scene object.
     */
    getViewports(): Array<StackViewport | VolumeViewport>;
    private _setViewportsToBeRenderedNextFrame;
    /**
     * @method render Renders all viewports on the next animation frame.
     */
    render(): void;
    /**
     * @method _render Sets up animation frame if necessary
     */
    private _render;
    /**
     * @method _renderFlaggedViewports Renders all viewports.
     */
    private _renderFlaggedViewports;
    /**
     * @method renderScene Renders only a specific `Scene` on the next animation frame.
     *
     * @param {string} sceneUID The UID of the scene to render.
     */
    renderScene(sceneUID: string): void;
    renderFrameOfReference: (FrameOfReferenceUID: string) => void;
    /**
     * @method renderScenes Renders the provided Scene UIDs.
     *
     * @returns{void}
     */
    renderScenes(sceneUIDs: Array<string>): void;
    /**
     * @method renderViewports Renders the provided Viewport UIDs.
     *
     * @returns{void}
     */
    renderViewports(viewportUIDs: Array<string>): void;
    /**
     * @method _renderScenes setup for rendering the provided Scene UIDs.
     *
     * @returns{void}
     */
    private _renderScenes;
    /**
     * @method renderViewport Renders only a specific `Viewport` on the next animation frame.
     *
     * @param {string} viewportUID The UID of the viewport.
     */
    renderViewport(viewportUID: string): void;
    /**
     * @method _renderViewportToCanvas Renders a particular `Viewport`'s on screen canvas.
     * @param {Viewport} viewport The `Viewport` to render.
     * @param {object} offScreenCanvas The offscreen canvas to render from.
     */
    private _renderViewportToCanvas;
    /**
     * @method _resetViewport Reset the viewport by removing the data attributes
     * and clearing the context of draw. It also emits an element disabled event
     *
     * @param {Viewport} viewport The `Viewport` to render.
     * @returns{void}
     */
    private _resetViewport;
    /**
     * @method _reset Resets the `RenderingEngine`
     */
    private _reset;
    /**
     * @method destroy the rendering engine
     */
    destroy(): void;
    /**
     * @method _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
     * instance after its `destroy` method has been called.
     */
    private _throwIfDestroyed;
    _downloadOffScreenCanvas(): void;
    _debugRender(): void;
}
export default RenderingEngine;
