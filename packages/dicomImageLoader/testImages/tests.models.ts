import type { Types } from '@cornerstonejs/core';
import type { WADORSMetaData } from '../src/types';

/**
 * This is an interface for defining parametrised tests for WADO-URL and WADO-RS
 * image loaders.
 *
 * This interface is used in `packages/core/test/dicomImageLoader_wadors_test.js` and
 * `packages/core/test/dicomImageLoader_wadouri_test.js`.
 */
export interface IWadoUriTest {
  /**
   * A descriptive name for the test case.
   */
  name: string;
  /**
   * The Wado-uri url to load the image.
   * Karma is setup to serve files in `packages/dicomImageLoader/testImages/` at
   * the `/testImages/` path.
   *
   * So a file at `packages/dicomImageLoader/testImages/no-pixel-spacing.dcm`
   * can be referenced as `wadouri:/testImages/no-pixel-spacing.dcm`
   *
   * Note: The `wadouri:` prefix is required to trigger the dicomImageLoader.
   *
   * Example: `wadouri:/testImages/no-pixel-spacing.dcm`
   *
   */
  wadouri: string;
  /**
   * Frame specific expected test values.
   *
   * This is useful for multi-frame images where the expected metadata
   * modules/pixel data hash is different for each frame.
   */
  frames: Array<{
    /**
     * Frame index.  If not specified, defaults to 1.
     * Note: This is a 1-based index, so counts from frame 1 to numberOfFrames
     */
    index?: number;
    /**
     * The expected SHA256 hash of the pixel data for the frame.  This is used to
     * verify that the pixel data was loaded and decoded correctly.
     */
    pixelDataHash?: string;
    /**
     * Expected Cornerstone IImage object to return for this frame.
     */
    image?: Types.IImage | unknown;
    /**
     * Expected metadata module values for this frame.
     */
    metadataModule?: {
      [key: string]: object | undefined;
    };
  }>;
}

export interface IWadoRsTest {
  /**
   * A descriptive name for the test case.
   */
  name: string;
  /**
   * Not used currently.
   *
   * @todo add ability for tests to load images from
   * a mock Wado-RS server.
   */
  wadorsUrl: string;
  /**
   *
   * Wado-RS JSON metadata to allow loading of metadata without
   * having to fetch it from a Wado-RS server. This is used in the tess
   * to verify that metadata is parsed correctly.
   */
  wadorsMetadata?: WADORSMetaData | Record<string, unknown>;
  /**
   * Frame specific expected test values.
   *
   * This is useful for multi-frame images where the expected metadata
   * modules/pixel data hash is different for each frame.
   */
  frames: Array<{
    /**
     * Frame index.  If not specified, defaults to 1.
     * Note: This is a 1-based index, so counts from frame 1 to numberOfFrames
     */
    index?: number;
    /**
     * Not currently used - pending implementation of Wado-RS image loading.
     */
    pixelDataHash?: string;
    /**
     * Not currently used - pending implementation of Wado-RS image loading.
     */
    image?: Types.IImage | unknown;
    /**
     * Expected metadata module value for this frame.
     */
    metadataModule?: {
      [key: string]: object | undefined;
    };
  }>;
}
