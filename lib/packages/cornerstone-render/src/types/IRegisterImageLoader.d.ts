import ImageLoaderFn from './ImageLoaderFn';
interface IRegisterImageLoader {
    registerImageLoader: (scheme: string, imageLoader: ImageLoaderFn) => void;
}
export default IRegisterImageLoader;
