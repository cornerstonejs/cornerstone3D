/**
 * Part of this library's setup. Required to setup image-loading capabilities. Our
 * integration and injection point for `cornerstone-core`.
 *
 * @remarks
 * `cornerstone-core` provides a method to register an image loader. It also provides
 * a mechanism for caching image data, a generic interface for image loaders, and a
 * few other benefits. For the time being, we leverage those benefits by injecting
 * `cornerstone-core` as a dependency when we use this method to wire up our image
 * loader.
 *
 * Under the hood, this method registers a new "Image Loader" with `cornerstone-core`.
 * It uses the "vtkjs" scheme for image ids.
 *
 * @public
 * @example
 * Wiring up the image-loader and providing cornerstone
 * ```
 * import cornerstone from 'cornerstone-core';
 * import { registerImageLoader } from 'vtkjs-viewport';
 *
 * registerImageLoader(cornerstone);
 * ```
 */
declare function registerWebImageLoader(cs: any): void;
export { registerWebImageLoader };
