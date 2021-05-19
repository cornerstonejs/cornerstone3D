import EVENTS from '../enums/events';
import renderingEngineCache from './renderingEngineCache';
import VIEWPORT_TYPE from '../constants/viewportType';
import eventTarget from '../eventTarget';
import { triggerEvent, uuidv4 } from '../utilities';
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';
import VolumeViewport from './VolumeViewport';
import StackViewport from './StackViewport';
import Scene from './Scene';
import isEqual from 'lodash.isequal';
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
class RenderingEngine {
    /**
     *
     * @param uid - Unique identifier for RenderingEngine
     */
    constructor(uid) {
        this._needsRender = new Set();
        this._animationFrameSet = false;
        this._animationFrameHandle = null;
        /**
         * @method _renderFlaggedViewports Renders all viewports.
         */
        this._renderFlaggedViewports = () => {
            this._throwIfDestroyed();
            const { offscreenMultiRenderWindow } = this;
            const renderWindow = offscreenMultiRenderWindow.getRenderWindow();
            const renderers = offscreenMultiRenderWindow.getRenderers();
            for (let i = 0; i < renderers.length; i++) {
                renderers[i].renderer.setDraw(true);
            }
            renderWindow.render();
            const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
            const context = openGLRenderWindow.get3DContext();
            const offScreenCanvas = context.canvas;
            const viewports = this._getViewportsAsArray();
            for (let i = 0; i < viewports.length; i++) {
                const viewport = viewports[i];
                if (this._needsRender.has(viewport.uid)) {
                    this._renderViewportToCanvas(viewport, offScreenCanvas);
                    // This viewport has been rendered, we can remove it from the set
                    this._needsRender.delete(viewport.uid);
                    // If there is nothing left that is flagged for rendering, stop here
                    // and allow RAF to be called again
                    if (this._needsRender.size === 0) {
                        this._animationFrameSet = false;
                        this._animationFrameHandle = null;
                        return;
                    }
                }
            }
        };
        this.renderFrameOfReference = (FrameOfReferenceUID) => {
            const viewports = this._getViewportsAsArray();
            const viewportUidsWithSameFrameOfReferenceUID = viewports.map((vp) => {
                if (vp.getFrameOfReferenceUID() === FrameOfReferenceUID) {
                    return vp.uid;
                }
            });
            return this.renderViewports(viewportUidsWithSameFrameOfReferenceUID);
        };
        this.uid = uid ? uid : uuidv4();
        renderingEngineCache.set(this);
        this.offscreenMultiRenderWindow = vtkOffscreenMultiRenderWindow.newInstance();
        this.offScreenCanvasContainer = document.createElement('div');
        this.offscreenMultiRenderWindow.setContainer(this.offScreenCanvasContainer);
        this._scenes = new Map();
        this._viewports = new Map();
        this.hasBeenDestroyed = false;
    }
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
    enableElement(viewportInputEntry) {
        this._throwIfDestroyed();
        const { canvas, viewportUID, sceneUID } = viewportInputEntry;
        // Throw error if no canvas
        if (!canvas) {
            throw new Error('No canvases provided');
        }
        // 1. Get the viewport from the list of available viewports.
        let viewport = this.getViewport(viewportUID);
        // 1.a) If there is a found viewport, and the scene Id has changed, we
        // remove the viewport and create a new viewport
        if (viewport) {
            this.disableElement(viewportUID);
            // todo: if only removing the viewport, make sure resize also happens
            // this._removeViewport(viewportUID)
        }
        // 2. Retrieving the list of viewports for calculation of the new size for
        // offScreen canvas.
        const viewports = this._getViewportsAsArray();
        const canvases = viewports.map((vp) => vp.canvas);
        canvases.push(viewportInputEntry.canvas);
        // 2.a Calculating the new size for offScreen Canvas
        const { offScreenCanvasWidth, offScreenCanvasHeight, } = this._resizeOffScreenCanvas(canvases);
        // 2.b Re-position previous viewports on the offScreen Canvas based on the new
        // offScreen canvas size
        const _xOffset = this._resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight);
        // 3 Add the requested viewport to rendering Engine
        this._addViewport(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset);
        // 4. Check if the viewport is part of a scene, if yes, add the available
        // volume Actors to the viewport too
        viewport = this.getViewport(viewportUID);
        // 4.a Only volumeViewports have scenes
        if (viewport instanceof VolumeViewport) {
            const scene = viewport.getScene();
            const volActors = scene.getVolumeActors();
            const viewportActors = viewport.getActors();
            // add the volume actor if not the same as the viewport actor
            if (!isEqual(volActors, viewportActors)) {
                scene.addVolumeActors(viewportUID);
            }
        }
        // 5. Add the new viewport to the queue to be rendered
        this._setViewportsToBeRenderedNextFrame([viewportInputEntry.viewportUID]);
    }
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
    disableElement(viewportUID) {
        this._throwIfDestroyed();
        // 1. Getting the viewport to remove it
        const viewport = this.getViewport(viewportUID);
        // 1.a To throw if there is no viewport stored in rendering engine
        if (!viewport) {
            console.warn(`viewport ${viewportUID} does not exist`);
            return;
        }
        // 1.b Remove the requested viewport from the rendering engine
        this._removeViewport(viewportUID);
        // 2. Remove the related renderer from the offScreenMultiRenderWindow
        this.offscreenMultiRenderWindow.removeRenderer(viewportUID);
        // 3. Reset the viewport to remove attributes, and reset the canvas
        this._resetViewport(viewport);
        // 4. Resize the offScreen canvas to accommodate for the new size (after removal)
        this.resize();
    }
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
    _removeViewport(viewportUID) {
        // 1. Get the viewport
        const viewport = this.getViewport(viewportUID);
        if (!viewport) {
            console.warn(`viewport ${viewportUID} does not exist`);
            return;
        }
        // 2. Delete the viewports from the the viewports
        this._viewports.delete(viewportUID);
        // 3. Remove viewport from scene if scene exists
        if (viewport instanceof VolumeViewport) {
            const scene = viewport.getScene();
            if (scene) {
                // 3.a Remove the viewport UID from the scene
                scene.removeViewportByUID(viewportUID);
                // 3.b If scene doesn't have any more viewports after this removal delete it
                if (!scene.getViewportUIDs().length) {
                    this.removeScene(scene.uid);
                }
            }
        }
    }
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
    _addViewport(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset) {
        const { canvas, sceneUID, viewportUID, type, defaultOptions, } = viewportInputEntry;
        // 1. Calculate the size of location of the viewport on the offScreen canvas
        const { sxStartDisplayCoords, syStartDisplayCoords, sxEndDisplayCoords, syEndDisplayCoords, sx, sy, sWidth, sHeight, } = this._getViewportCoordsOnOffScreenCanvas(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset);
        // 2. Add a renderer to the offScreenMultiRenderWindow
        this.offscreenMultiRenderWindow.addRenderer({
            viewport: [
                sxStartDisplayCoords,
                syStartDisplayCoords,
                sxEndDisplayCoords,
                syEndDisplayCoords,
            ],
            uid: viewportUID,
            background: defaultOptions.background
                ? defaultOptions.background
                : [0, 0, 0],
        });
        // 3. ViewportInput to be passed to a stack/volume viewport
        const viewportInput = {
            uid: viewportUID,
            renderingEngineUID: this.uid,
            type,
            canvas,
            sx,
            sy,
            sWidth,
            sHeight,
            defaultOptions: defaultOptions || {},
        };
        // 4. Create a proper viewport based on the type of the viewport
        let viewport;
        if (type === VIEWPORT_TYPE.STACK) {
            // 4.a Create stack viewport
            viewport = new StackViewport(viewportInput);
        }
        else if (type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
            // 4.a Create volume viewport
            // 4.b Check if the provided scene already exists
            let scene = this.getScene(sceneUID);
            // 4.b Create a scene if does not exists and add to scenes
            // Note: A scene will ALWAYS be created for a volume viewport.
            // If a sceneUID is provided, it will get used for creating a scene.
            // if the sceneUID is not provided, we create an internal scene by
            // generating a random UID. However, the getScene API will not return
            // internal scenes.
            if (!scene) {
                scene = new Scene(sceneUID, this.uid);
                this._scenes.set(sceneUID, scene);
            }
            // 4.b Create a scene if does not exists and add to scenes
            viewportInput.sceneUID = scene.uid;
            // 4.b Create a volume viewport and adds it to the scene
            viewport = new VolumeViewport(viewportInput);
            scene.addViewportByUID(viewportUID);
        }
        else {
            throw new Error(`Viewport Type ${type} is not supported`);
        }
        // 5. Storing the viewports
        this._viewports.set(viewportUID, viewport);
        const eventData = {
            canvas,
            viewportUID,
            sceneUID,
            renderingEngineUID: this.uid,
        };
        triggerEvent(eventTarget, EVENTS.ELEMENT_ENABLED, eventData);
    }
    /**
     * Creates `Scene`s containing `Viewport`s and sets up the offscreen render
     * window to allow offscreen rendering and transmission back to the target
     * canvas in each viewport.
     *
     * @param viewportInputEntries An array of viewport definitions to construct the rendering engine
     * /todo: if don't want scene don't' give uid
     */
    setViewports(viewportInputEntries) {
        this._throwIfDestroyed();
        this._reset();
        // 1. Getting all the canvases from viewports calculation of the new offScreen size
        const canvases = viewportInputEntries.map((vp) => vp.canvas);
        // 2. Set canvas size based on height and sum of widths
        const { offScreenCanvasWidth, offScreenCanvasHeight, } = this._resizeOffScreenCanvas(canvases);
        /*
        TODO: Commenting this out until we can mock the Canvas usage in the tests (or use jsdom?)
        if (!offScreenCanvasWidth || !offScreenCanvasHeight) {
          throw new Error('Invalid offscreen canvas width or height')
        }*/
        // 3. Adding the viewports based on the viewportInputEntry definition to the
        // rendering engine.
        let _xOffset = 0;
        for (let i = 0; i < viewportInputEntries.length; i++) {
            const viewportInputEntry = viewportInputEntries[i];
            const { canvas } = viewportInputEntry;
            this._addViewport(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset);
            // Incrementing the xOffset which provides the horizontal location of each
            // viewport on the offScreen canvas
            _xOffset += canvas.clientWidth;
        }
    }
    /**
     * Resizes the offscreen canvas based on the provided canvases
     *
     * @param canvases An array of HTML Canvas
     */
    _resizeOffScreenCanvas(canvases) {
        const { offScreenCanvasContainer, offscreenMultiRenderWindow } = this;
        // 1. Calculated the height of the offScreen canvas to be the maximum height
        // between canvases
        const offScreenCanvasHeight = Math.max(...canvases.map((canvas) => canvas.clientHeight));
        // 2. Calculating the width of the offScreen canvas to be the sum of all
        let offScreenCanvasWidth = 0;
        canvases.forEach((canvas) => {
            offScreenCanvasWidth += canvas.clientWidth;
        });
        offScreenCanvasContainer.width = offScreenCanvasWidth;
        offScreenCanvasContainer.height = offScreenCanvasHeight;
        // 3. Resize command
        offscreenMultiRenderWindow.resize();
        return { offScreenCanvasWidth, offScreenCanvasHeight };
    }
    /**
     * Recalculates and updates the viewports location on the offScreen canvas upon its resize
     *
     * @param viewports An array of viewports
     * @param offScreenCanvasWidth new offScreen canvas width
     * @param offScreenCanvasHeight new offScreen canvas height
     *
     * @returns {number} _xOffset the final offset which will be used for the next viewport
     */
    _resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight) {
        // Redefine viewport properties
        let _xOffset = 0;
        for (let i = 0; i < viewports.length; i++) {
            const viewport = viewports[i];
            const { sxStartDisplayCoords, syStartDisplayCoords, sxEndDisplayCoords, syEndDisplayCoords, sx, sy, sWidth, sHeight, } = this._getViewportCoordsOnOffScreenCanvas(viewport, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset);
            _xOffset += viewport.canvas.clientWidth;
            viewport.sx = sx;
            viewport.sy = sy;
            viewport.sWidth = sWidth;
            viewport.sHeight = sHeight;
            // Updating the renderer for the viewport
            const renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.uid);
            renderer.setViewport([
                sxStartDisplayCoords,
                syStartDisplayCoords,
                sxEndDisplayCoords,
                syEndDisplayCoords,
            ]);
        }
        // Returns the final xOffset
        return _xOffset;
    }
    /**
     * @method resize Resizes the offscreen viewport and recalculates translations to on screen canvases.
     * It is up to the parent app to call the size of the on-screen canvas changes.
     * This is left as an app level concern as one might want to debounce the changes, or the like.
     */
    resize() {
        this._throwIfDestroyed();
        // 1. Get the viewports' canvases
        const viewports = this._getViewportsAsArray();
        const canvases = viewports.map((vp) => vp.canvas);
        // 2. Recalculate and resize the offscreen canvas size
        const { offScreenCanvasWidth, offScreenCanvasHeight, } = this._resizeOffScreenCanvas(canvases);
        // 3. Recalculate the viewports location on the off screen canvas
        this._resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight);
        // 4. Render all
        this.render();
    }
    /**
     * Calculates the location of the provided viewport on the offScreenCanvas
     *
     * @param viewports An array of viewports
     * @param offScreenCanvasWidth new offScreen canvas width
     * @param offScreenCanvasHeight new offScreen canvas height
     * @param _xOffset xOffSet to draw
     */
    _getViewportCoordsOnOffScreenCanvas(viewport, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset) {
        const { canvas } = viewport;
        const { clientWidth, clientHeight } = canvas;
        // Set the canvas to be same resolution as the client.
        if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
            canvas.width = clientWidth;
            canvas.height = clientHeight;
        }
        // Update the canvas drawImage offsets.
        const sx = _xOffset;
        const sy = 0;
        const sWidth = clientWidth;
        const sHeight = clientHeight;
        const sxStartDisplayCoords = sx / offScreenCanvasWidth;
        // Need to offset y if it not max height
        const syStartDisplayCoords = sy + (offScreenCanvasHeight - clientHeight) / offScreenCanvasHeight;
        const sWidthDisplayCoords = sWidth / offScreenCanvasWidth;
        const sHeightDisplayCoords = sHeight / offScreenCanvasHeight;
        return {
            sxStartDisplayCoords,
            syStartDisplayCoords,
            sxEndDisplayCoords: sxStartDisplayCoords + sWidthDisplayCoords,
            syEndDisplayCoords: syStartDisplayCoords + sHeightDisplayCoords,
            sx,
            sy,
            sWidth,
            sHeight,
        };
    }
    /**
     * @method getScene Returns the scene, only scenes with SceneUID (not internal)
     * are returned
     * @param {string} sceneUID The UID of the scene to fetch.
     *
     * @returns {Scene} The scene object.
     */
    getScene(sceneUID) {
        this._throwIfDestroyed();
        // Todo: should the volume be decached?
        return this._scenes.get(sceneUID);
    }
    /**
     * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
     *
     * @returns {Scene} The scene object.
     */
    getScenes() {
        this._throwIfDestroyed();
        return Array.from(this._scenes.values()).filter((s) => {
            // Do not return Scenes not explicitly created by the user
            return s.getIsInternalScene() === false;
        });
    }
    /**
     * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
     *
     * @returns {Scene} The scene object.
     */
    removeScene(sceneUID) {
        this._throwIfDestroyed();
        this._scenes.delete(sceneUID);
    }
    /**
     * @method _getViewportsAsArray Returns an array of all viewports
     *
     * @returns {Array} Array of viewports.
     */
    _getViewportsAsArray() {
        return Array.from(this._viewports.values());
    }
    /**
     * @method getViewport Returns the viewport by UID
     *
     * @returns {StackViewport | VolumeViewport} viewport
     */
    getViewport(uid) {
        return this._viewports.get(uid);
    }
    /**
     * @method getViewportsContainingVolumeUID Returns the viewport containing the volumeUID
     *
     * @returns {VolumeViewport} viewports
     */
    getViewportsContainingVolumeUID(uid) {
        const viewports = this._getViewportsAsArray();
        return viewports.filter((vp) => {
            const volActors = vp.getDefaultActor();
            return volActors.volumeActor && volActors.uid === uid;
        });
    }
    /**
     * @method getScenesContainingVolume Returns the scenes containing the volumeUID
     *
     * @returns {Scene} scenes
     */
    getScenesContainingVolume(uid) {
        const scenes = this.getScenes();
        return scenes.filter((scene) => {
            const volumeActors = scene.getVolumeActors();
            const firstActor = volumeActors[0];
            return firstActor.volumeActor && firstActor.uid === uid;
        });
    }
    /**
     * @method getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
     *
     * @returns {Viewport} The scene object.
     */
    getViewports() {
        this._throwIfDestroyed();
        return this._getViewportsAsArray();
    }
    _setViewportsToBeRenderedNextFrame(viewportUIDs) {
        // Add the viewports to the set of flagged viewports
        viewportUIDs.forEach((viewportUID) => {
            this._needsRender.add(viewportUID);
        });
        // Render any flagged viewports
        this._render();
    }
    /**
     * @method render Renders all viewports on the next animation frame.
     */
    render() {
        const viewports = this.getViewports();
        const viewportUIDs = viewports.map((vp) => vp.uid);
        this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method _render Sets up animation frame if necessary
     */
    _render() {
        // If we have viewports that need rendering and we have not already
        // set the RAF callback to run on the next frame.
        if (this._needsRender.size > 0 && this._animationFrameSet === false) {
            this._animationFrameHandle = window.requestAnimationFrame(this._renderFlaggedViewports);
            // Set the flag that we have already set up the next RAF call.
            this._animationFrameSet = true;
        }
    }
    /**
     * @method renderScene Renders only a specific `Scene` on the next animation frame.
     *
     * @param {string} sceneUID The UID of the scene to render.
     */
    renderScene(sceneUID) {
        const scene = this.getScene(sceneUID);
        const viewportUIDs = scene.getViewportUIDs();
        this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method renderScenes Renders the provided Scene UIDs.
     *
     * @returns{void}
     */
    renderScenes(sceneUIDs) {
        const scenes = sceneUIDs.map((sUid) => this.getScene(sUid));
        this._renderScenes(scenes);
    }
    /**
     * @method renderViewports Renders the provided Viewport UIDs.
     *
     * @returns{void}
     */
    renderViewports(viewportUIDs) {
        this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method _renderScenes setup for rendering the provided Scene UIDs.
     *
     * @returns{void}
     */
    _renderScenes(scenes) {
        this._throwIfDestroyed();
        const viewportUIDs = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const sceneViewportUIDs = scene.getViewportUIDs();
            viewportUIDs.push(...sceneViewportUIDs);
        }
        this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method renderViewport Renders only a specific `Viewport` on the next animation frame.
     *
     * @param {string} viewportUID The UID of the viewport.
     */
    renderViewport(viewportUID) {
        this._setViewportsToBeRenderedNextFrame([viewportUID]);
    }
    /**
     * @method _renderViewportToCanvas Renders a particular `Viewport`'s on screen canvas.
     * @param {Viewport} viewport The `Viewport` to render.
     * @param {object} offScreenCanvas The offscreen canvas to render from.
     */
    _renderViewportToCanvas(viewport, offScreenCanvas) {
        const { sx, sy, sWidth, sHeight, uid, sceneUID, renderingEngineUID, } = viewport;
        const canvas = viewport.canvas;
        const { width: dWidth, height: dHeight } = canvas;
        const onScreenContext = canvas.getContext('2d');
        onScreenContext.drawImage(offScreenCanvas, sx, sy, sWidth, sHeight, 0, //dx
        0, // dy
        dWidth, dHeight);
        const eventData = {
            canvas,
            viewportUID: uid,
            sceneUID,
            renderingEngineUID,
        };
        triggerEvent(canvas, EVENTS.IMAGE_RENDERED, eventData);
    }
    /**
     * @method _resetViewport Reset the viewport by removing the data attributes
     * and clearing the context of draw. It also emits an element disabled event
     *
     * @param {Viewport} viewport The `Viewport` to render.
     * @returns{void}
     */
    _resetViewport(viewport) {
        const renderingEngineUID = this.uid;
        const { canvas, uid: viewportUID } = viewport;
        const eventData = {
            canvas,
            viewportUID,
            //sceneUID, // todo: where to get this now?
            renderingEngineUID,
        };
        canvas.removeAttribute('data-viewport-uid');
        canvas.removeAttribute('data-scene-uid');
        canvas.removeAttribute('data-rendering-engine-uid');
        // todo: remove svg layer
        // clear drawing
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        triggerEvent(eventTarget, EVENTS.ELEMENT_DISABLED, eventData);
    }
    /**
     * @method _reset Resets the `RenderingEngine`
     */
    _reset() {
        const viewports = this._getViewportsAsArray();
        viewports.forEach((viewport) => {
            this._resetViewport(viewport);
        });
        window.cancelAnimationFrame(this._animationFrameHandle);
        this._needsRender.clear();
        this._animationFrameSet = false;
        this._animationFrameHandle = null;
        this._viewports = new Map();
        this._scenes = new Map();
    }
    /**
     * @method destroy the rendering engine
     */
    destroy() {
        if (this.hasBeenDestroyed) {
            return;
        }
        this._reset();
        // Free up WebGL resources
        this.offscreenMultiRenderWindow.delete();
        renderingEngineCache.delete(this.uid);
        // Make sure all references go stale and are garbage collected.
        delete this.offscreenMultiRenderWindow;
        this.hasBeenDestroyed = true;
    }
    /**
     * @method _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
     * instance after its `destroy` method has been called.
     */
    _throwIfDestroyed() {
        if (this.hasBeenDestroyed) {
            throw new Error('this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.');
        }
    }
    // debugging utils for offScreen canvas
    _downloadOffScreenCanvas() {
        const dataURL = this._debugRender();
        _TEMPDownloadURI(dataURL);
    }
    // debugging utils for offScreen canvas
    _debugRender() {
        // Renders all scenes
        const { offscreenMultiRenderWindow } = this;
        const renderWindow = offscreenMultiRenderWindow.getRenderWindow();
        const renderers = offscreenMultiRenderWindow.getRenderers();
        for (let i = 0; i < renderers.length; i++) {
            renderers[i].renderer.setDraw(true);
        }
        renderWindow.render();
        const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
        const context = openGLRenderWindow.get3DContext();
        const offScreenCanvas = context.canvas;
        const dataURL = offScreenCanvas.toDataURL();
        this._getViewportsAsArray().forEach((viewport) => {
            const { sx, sy, sWidth, sHeight } = viewport;
            const canvas = viewport.canvas;
            const { width: dWidth, height: dHeight } = canvas;
            const onScreenContext = canvas.getContext('2d');
            //sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
            onScreenContext.drawImage(offScreenCanvas, sx, sy, sWidth, sHeight, 0, //dx
            0, // dy
            dWidth, dHeight);
        });
        return dataURL;
    }
}
export default RenderingEngine;
// debugging utils for offScreen canvas
function _TEMPDownloadURI(uri) {
    const link = document.createElement('a');
    link.download = 'viewport.png';
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
//# sourceMappingURL=RenderingEngine.js.map