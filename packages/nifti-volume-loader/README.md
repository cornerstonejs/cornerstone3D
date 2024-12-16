# @cornerstonejs/nifti-volume-loader

Nifti volume loader for the cornerstone3D framework.

# Injecting headers

You can inject custom headers to the requests made by the loader. This is useful for authentication purposes.

```js
import { init } from '@cornerstonejs/nifti-volume-loader';

niftiInit({
  beforeSend: (xhr, headers, url) => {
    headers['Cornerstone3D-Is-Awesome'] = 'True';
    return headers;
  },
});
```

Now, every request made by the loader will have the `Cornerstone3D-Is-Awesome` header with the value `True`.
