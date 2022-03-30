import ImageLoaderFn from './ImageLoaderFn';

/**
 * Register image loader interface
 */
interface IRegisterImageLoader {
  registerImageLoader: (scheme: string, imageLoader: ImageLoaderFn) => void;
}

export default IRegisterImageLoader;
