import type { IViewport, DataSetOptions } from './IViewport';
import type WSIViewport from '../RenderingEngine/GenericViewport/WSI/WSIViewport';
import type WSIViewportProperties from './WSIViewportProperties';
import type Point3 from './Point3';
import type Point2 from './Point2';
import type ICamera from './ICamera';
import type { VOIRange } from './voi';
import type CPUIImageData from './CPUIImageData';
import type { WSIClientLike, WSIMapViewLike } from '../utilities/WSIUtilities';

/**
 * Public interface of the legacy whole slide viewport. Its class is gone: a
 * `WHOLE_SLIDE` type gives the legacy adapter of the next whole slide viewport.
 */
export interface ILegacyWSIViewport extends IViewport {
  modality: string;
  readonly uid: string;
  setFrameNumber(frame: number): Promise<void>;
  setProperties(props: WSIViewportProperties): void;
  getProperties: () => WSIViewportProperties;
  /**
   * resetProperties resets the properties of the viewport to the default
   * values.  It is called by the resetViewer command in OHIF which is called when using
   * the reset toolbar button.
   */
  resetProperties(): void;
  /**
   * setVOI sets the window level and window width for the image.  This is
   * used to set the contrast and brightness of the image.
   * feFilter is an inline string value for the CSS filter on the openLayers
   * CSS filters can reference SVG filters, so for the typical use case here
   * the CSS filter is actually an link link to a SVG filter.
   * the WSI viewport has two openlayers canvases; one for the main display and one for
   * the map overlay on the bottom left corner.
   */
  setVOI(voiRange: VOIRange): void;
  setAverageWhite(averageWhite: [number, number, number]): void;
  getImageData(): CPUIImageData;
  /**
   * Checks to see if the imageURI is currently being displayed.  The imageURI
   * may contain frame numbers according to the DICOM standard format, which
   * will be stripped to compare the base image URI, and then the values used
   * to check if that frame is currently being displayed.
   *
   * The DICOM standard allows for comma separated values as well, however,
   * this is not supported here, with only a single range or single value
   * being tested.
   *
   * For a single value, the time range +/- 5 frames is permitted to allow
   * the detection to actually succeed when nearby without requiring an exact
   * time frame to be matched.
   *
   * @param imageURI - containing frame number or range.
   * @returns
   */
  hasImageURI(imageURI: string): boolean;
  setCamera(camera: ICamera): void;
  /**
   * This function returns the imageID associated with either the current
   * frame being displayed, or the range of frames being played.  This may not
   * correspond to any particular imageId that has imageId metadata, as the
   * format is one of:
   * `<DICOMweb URI>/frames/<Start Frame>(-<End Frame>)?`
   * or
   * `<Other URI>[?&]frameNumber=<Start Frame>(-<EndFrame>)?`
   * for a URL parameter.
   *
   * @returns an imageID for video
   */
  getCurrentImageId(): string;
  getFrameNumber(): number;
  resetCamera: () => boolean;
  /**
   * Gets the number of slices -  this will be the number of focal planes,
   * and not hte actual number of slices in the image sets.
   */
  getNumberOfSlices: () => number;
  /**
   * The FOR for whole slide imaging is the frame of reference in the DICOM
   * metadata, and should be the same for all slices being viewed.
   */
  getFrameOfReferenceUID: () => string;
  /**
   * Converts a slide coordinate to a image coordinate using WSI utils functions
   * @param point
   * @returns
   */
  worldToIndexWSI(point: Point3): Point2;
  /**
   * Converts a image coordinate to a slide coordinate using WSI utils functions
   * @param point
   * @returns
   */
  indexToWorldWSI(point: Point2): Point3;
  worldToIndex(point: Point3): Point3;
  indexToWorld(point: Point3): Point3;
  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPosition - to convert to world
   * @returns World position
   */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /**
   * Converts and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  worldToCanvas: (worldPos: Point3) => Point2;
  /** GenericViewport compat shim – resolves dataId metadata and delegates to setDataIds. */
  setDataList(
    entries: Array<{ dataId: string; options?: Record<string, unknown> }>
  ): Promise<void>;
  /**
   * This is a wrapper for setWSI to allow generic behaviour
   */
  setDataIds(
    imageIds: string[],
    options?: DataSetOptions & {
      miniNavigationOverlay?: boolean;
      webClient: WSIClientLike;
    }
  ): Promise<void>;
  setWSI(imageIds: string[], client: WSIClientLike): Promise<void>;
  /**
   * Mounts display sets on the viewport, mirroring the GenericViewport
   * `setDisplaySets` API. The `displaySetId` is resolved through the registered
   * generic-viewport dataset metadata (see `genericViewportDisplaySetMetadataProvider`)
   * to its WSI `imageIds` and `webClient`, which are loaded via `setWSI`.
   * Resolution and loading run inside {@link mountDisplaySets}, which records
   * the mounted entries after `setWSI` so {@link getDisplaySets} reports them.
   *
   * @param entries - display set entries to mount; the first is used as the WSI source.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
  /**
   * Scrolls the image - for WSI, this changes the zoom ratio since different
   * images are used to represent different zoom levels, although this also
   * allows fractional zoom levels
   */
  scroll(delta: number): void;
  /** This can be implemented later when multi-slice WSI is supported */
  getSliceIndex(): number;
  /**
   * Gets the internal OpenLayers view object being rendered
   * Note this is not typeds right now, but might add typing later.
   */
  getView(): WSIMapViewLike | undefined;
  customRenderViewportToCanvas: () => void;
  getZoom(): number;
  setZoom(zoom: number): void;
  /**
   * Returns the list of image Ids for the viewport.  Currently only
   * returns the first/primary image id.
   * @returns list of strings for image Ids
   */
  getImageIds: () => Array<string>;
  getViewReferenceId(): string;
}

/**
 * A whole slide viewport: the legacy one or the generic one.
 */
type IWSIViewport = ILegacyWSIViewport | WSIViewport;

export type { IWSIViewport as default };
