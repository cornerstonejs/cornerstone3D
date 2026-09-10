import type { LoaderDecodeOptions } from './LoaderDecodeOptions';
import type {
  LoaderXhrRequestError,
  LoaderXhrRequestParams,
} from './XHRRequest';

export interface LoaderOptions {
  maxWebWorkers?: number;
  // callback to open the object
  open?: (
    xhr: XMLHttpRequest,
    url: string,
    defaultHeaders: Record<string, string>,
    params: LoaderXhrRequestParams
  ) => void;
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend?: (
    xhr: XMLHttpRequest,
    imageId: string,
    defaultHeaders: Record<string, string>,
    params: LoaderXhrRequestParams
  ) => Promise<Record<string, string> | void> | Record<string, string> | void;
  // callback allowing modification of the xhr response before creating image objects
  beforeProcessing?: (xhr: XMLHttpRequest) => Promise<ArrayBuffer>;
  // callback allowing modification of newly created image objects
  imageCreated?: (imageObject: unknown) => void;
  onloadstart?: (event: ProgressEvent<EventTarget>, params: unknown) => void;
  onloadend?: (event: ProgressEvent<EventTarget>, params: unknown) => void;
  onreadystatechange?: (event: Event, params: unknown) => void;
  onprogress?: (event: ProgressEvent<EventTarget>, params: unknown) => void;
  errorInterceptor?: (error: LoaderXhrRequestError) => void;
  strict?: boolean;
  /**
   * Base path all codec WASM binaries are loaded from, e.g. `/assets/cs-wasm/`,
   * `./cs-wasm/` or `https://cdn.example.com/cs-wasm/`. The directory must
   * contain the codec binaries under their published file names:
   * `charlswasm_decode.wasm`, `libjpegturbowasm_decode.wasm`,
   * `openjpegwasm_decode.wasm` and `openjphjs.wasm`.
   *
   * This is a single root for every codec - there is no per-codec path. A
   * relative path resolves against the decode worker's location.
   *
   * When unset, each decoder resolves its binary relative to its own module
   * with a bare `@cornerstonejs/codec-...` specifier. Bundlers do not rewrite
   * bare specifiers inside `new URL(...)`, so bundled applications should set
   * this option and serve the binaries themselves (copying them at build time
   * out of the `dist` directory of each `@cornerstonejs/codec-...` package).
   */
  wasmBasePath?: string;
  decodeConfig?: LoaderDecodeOptions;
  /**
   * When true, registers the legacy wadouri/wadors metadata providers.
   * Default is false (use the new metadata design). Set to true only for
   * backward compatibility.
   * New design: use addDicomPart10Instance and addDicomWebInstance from
   * @cornerstonejs/metadata to populate the NATURAL cache instead.
   * @see https://www.cornerstonejs.org/docs/concepts/cornerstone-core/metadataProvider
   */
  useLegacyMetadataProvider?: boolean;
}
