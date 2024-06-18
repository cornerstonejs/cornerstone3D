import ImageLoaderFn from './ImageLoaderFn.js';

/**
 * Register image loader interface
 */
interface IRegisterImageLoader {
  registerImageLoader: (scheme: string, imageLoader: ImageLoaderFn) => void;
}

export default IRegisterImageLoader;
