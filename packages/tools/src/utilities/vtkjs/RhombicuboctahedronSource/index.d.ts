import { vtkAlgorithm, vtkObject } from '@kitware/vtk.js/interfaces';

/**
 * vtkRhombicuboctahedronSource
 */
export interface IRhombicuboctahedronSourceInitialValues {
  scale?: number;
  generate3DTextureCoordinates?: boolean;
  generateMainFaces?: boolean;
  generateEdgeFaces?: boolean;
  generateCornerFaces?: boolean;
}

export interface vtkRhombicuboctahedronSource extends vtkAlgorithm {
  /**
   * Get the scale factor for the rhombicuboctahedron.
   */
  getScale(): number;

  /**
   * Set the scale factor for the rhombicuboctahedron.
   * @param {Number} scale The scale factor.
   */
  setScale(scale: number): boolean;

  /**
   * Get whether to generate 3D texture coordinates.
   */
  getGenerate3DTextureCoordinates(): boolean;

  /**
   * Set whether to generate 3D texture coordinates.
   * @param {Boolean} generate3DTextureCoordinates
   */
  setGenerate3DTextureCoordinates(
    generate3DTextureCoordinates: boolean
  ): boolean;

  /**
   * Get whether to generate the 6 main square faces.
   */
  getGenerateMainFaces(): boolean;

  /**
   * Set whether to generate the 6 main square faces.
   * @param {Boolean} generateMainFaces
   */
  setGenerateMainFaces(generateMainFaces: boolean): boolean;

  /**
   * Get whether to generate the 12 edge square faces.
   */
  getGenerateEdgeFaces(): boolean;

  /**
   * Set whether to generate the 12 edge square faces.
   * @param {Boolean} generateEdgeFaces
   */
  setGenerateEdgeFaces(generateEdgeFaces: boolean): boolean;

  /**
   * Get whether to generate the 8 corner triangular faces.
   */
  getGenerateCornerFaces(): boolean;

  /**
   * Set whether to generate the 8 corner triangular faces.
   * @param {Boolean} generateCornerFaces
   */
  setGenerateCornerFaces(generateCornerFaces: boolean): boolean;
}

/**
 * Method used to decorate a given object (publicAPI+model) with vtkRhombicuboctahedronSource characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param {IRhombicuboctahedronSourceInitialValues} [initialValues] (default: {})
 */
export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IRhombicuboctahedronSourceInitialValues
): void;

/**
 * Method used to create a new instance of vtkRhombicuboctahedronSource.
 * @param {IRhombicuboctahedronSourceInitialValues} [initialValues] for pre-setting some of its content
 */
export function newInstance(
  initialValues?: IRhombicuboctahedronSourceInitialValues
): vtkRhombicuboctahedronSource;

/**
 * vtkRhombicuboctahedronSource is a source object that creates a rhombicuboctahedron.
 * A rhombicuboctahedron is an Archimedean solid with 24 vertices and 26 faces:
 * - 6 square faces aligned with coordinate axes
 * - 12 square faces along edges
 * - 8 triangular faces at corners
 */
export declare const vtkRhombicuboctahedronSource: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtkRhombicuboctahedronSource;
