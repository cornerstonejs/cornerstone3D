declare type LibraryConfiguration = {
    /**
     * When an image is successfully loaded, automatically render it's volume's
     * rendering engine's scenes. (Tied to autoRenderPercentage)
     */
    autoRenderOnLoad?: boolean;
    /**
     * When autoRenderOnLoad is true, the percentage of frames that should be
     * loaded before the automatic rendering behavior occurs.
     */
    autoRenderPercentage?: number;
};
export default LibraryConfiguration;
