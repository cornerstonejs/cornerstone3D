import CPUFallbackColormapData from './CPUFallbackColormapData';
import CPUIImageData from './CPUIImageData';
import ICamera from './ICamera';
import IImageData from './IImageData';
import { IViewport } from './IViewport';
import Point2 from './Point2';
import Point3 from './Point3';
import { Scaling } from './ScalingParameters';
import VideoViewportProperties from './VideoViewportProperties';
import { ColormapRegistration } from './Colormap';
import IImage from './IImage';

/**
 * Interface for Stack Viewport
 */
export default interface IVideoViewport extends IViewport {
  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  resize: () => void;
  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   */
  getFrameOfReferenceUID: () => string;
  /**
   * Sets the properties for the viewport on the default actor.
   */
  setProperties(props: VideoViewportProperties, suppressEvents?: boolean): void;
  /**
   * Retrieve the viewport properties
   */
  getProperties: () => VideoViewportProperties;
  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s camera.
   */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   */
  worldToCanvas: (worldPos: Point3) => Point2;

  /**
   * Reset the viewport properties to the default values
   */
  resetProperties(): void;
  /**
   * If the user has selected CPU rendering, return the CPU camera, otherwise
   * return the default camera
   */
  getCamera(): ICamera;
  /**
   * Set the camera based on the provided camera object.
   */
  setCamera(cameraInterface: ICamera): void;
  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  resetCamera(resetPan?: boolean, resetZoom?: boolean): boolean;
  /**
   * If the renderer is CPU based, throw an error. Otherwise, returns the `vtkRenderer` responsible for rendering the `Viewport`.
   */
  getRenderer(): any;
}
