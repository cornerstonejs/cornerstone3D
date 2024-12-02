import type ImageLoaderFn from './ImageLoaderFn';

/**
 * Register image loader interface
 */
interface IRegisterImageLoader {
  registerImageLoader: (scheme: string, imageLoader: ImageLoaderFn) => void;
}

export type { IRegisterImageLoader as default };
