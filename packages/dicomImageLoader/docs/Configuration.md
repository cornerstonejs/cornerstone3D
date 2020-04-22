# Configuration

The Cornerstone WADO Image Loader can be configured by the following:

```js
cornerstoneWADOImageLoader.configure(options);
```

Where options can have the following properties:

- beforeSend - A callback that is executed before a network request. passes the
  `XMLHttpRequest` object.
- onloadend - Callback triggered when downloading an image ends. Passes the
  event and params object.
- onreadystatechange - Callback triggered on state change of request. Passes the
  event and params object.
- onprogress - Callback triggered when download progress event is fired.
  PoProgress. Passes the event and params object.
- errorInterceptor - Callback which may be used to deal with errors. Passes an
  Error object with these additional properties:
  - `request` - The `XMLHttpRequest` object.
  - `response` - The `response`, if any.
  - `status` - The HTTP `status` code.
- useWebWorkers - Whethere to decode in web workers.
- imageCreated - Callback allowing modification of newly created image objects.
- decodeConfig - The configuration for the decoder - `usePDFJS` to use OHIF
  image-JPEG2000 https://github.com/OHIF/image-JPEG2000.
- strict - Whether strict mode for image decoding is on.
