# Async beforeSend Callback

## What Changed

In version 4.x, the `beforeSend` callback in dicomImageLoader's LoaderOptions has been changed from synchronous to asynchronous, now returning a Promise.

### API Change

The `beforeSend` callback signature has been updated to support async operations:

```typescript
// Before (3.x)
beforeSend?: (
  xhr: XMLHttpRequest,
  imageId: string,
  defaultHeaders: Record<string, string>,
  params: LoaderXhrRequestParams
) => Record<string, string> | void;

// After (4.x)
beforeSend?: (
  xhr: XMLHttpRequest,
  imageId: string,
  defaultHeaders: Record<string, string>,
  params: LoaderXhrRequestParams
) => Promise<Record<string, string> | void>;
```

## Migration Guide

### Update Synchronous Callbacks

If you have existing synchronous `beforeSend` callbacks, wrap the return value in a Promise:

```javascript
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';

// Before (3.x) - Synchronous
dicomImageLoader.init({
  beforeSend: function (xhr, imageId, defaultHeaders, params) {
    const headers = {
      Authorization: 'Bearer ' + getAuthToken(),
      'Custom-Header': 'value',
    };
    return headers;
  },
});

// After (4.x) - Async with Promise
dicomImageLoader.init({
  beforeSend: function (xhr, imageId, defaultHeaders, params) {
    return Promise.resolve({
      Authorization: 'Bearer ' + getAuthToken(),
      'Custom-Header': 'value',
    });
  },
});

// Or use async/await syntax
dicomImageLoader.init({
  beforeSend: async function (xhr, imageId, defaultHeaders, params) {
    return {
      Authorization: 'Bearer ' + getAuthToken(),
      'Custom-Header': 'value',
    };
  },
});
```

### Leverage Async Capabilities

Now you can perform asynchronous operations in `beforeSend`:

```javascript
// Fetch auth token asynchronously
dicomImageLoader.init({
  beforeSend: async function (xhr, imageId, defaultHeaders, params) {
    // Can now make async calls
    const token = await fetchAuthToken();
    const customHeaders = await getCustomHeaders(imageId);

    return {
      Authorization: 'Bearer ' + token,
      ...customHeaders,
    };
  },
});
```

## Benefits

- **Async Operations**: Fetch authentication tokens or headers from remote sources
- **Token Refresh**: Automatically refresh expired tokens before requests
- **Conditional Headers**: Dynamically determine headers based on async checks
- **Better Integration**: Works seamlessly with modern async authentication flows

## Important Notes

- The callback must now return a Promise, even for synchronous operations
- Use `Promise.resolve()` for immediate values or `async/await` syntax
- The XHR request will wait for the Promise to resolve before sending
- Rejected promises will cause the image load to fail

## Why We Changed This

Modern authentication workflows often require asynchronous operations (token refresh, OAuth flows, etc.). Making `beforeSend` async enables proper integration with these patterns without workarounds.
