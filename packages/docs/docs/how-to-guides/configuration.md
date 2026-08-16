---
id: configuration
title: Configuration
summary: Guide for configuring various aspects of the Cornerstone3D library, including rendering engine settings, tools, and image loaders
---

# Configuration

Cornerstone Core accepts configuration through its `init` function. Pass the
configuration on the first call to `init`; subsequent calls return immediately
after Cornerstone has been initialized.

## Logging

Use the `logging` configuration to set a default log level and, optionally,
override individual named loggers.

```ts
import { init } from '@cornerstonejs/core';

init({
  logging: {
    level: 'warn',
    levels: {
      'cs3d.dicomImageLoader.wadouri': 'info',
      'cs3d.dicomImageLoader.wadors': 'debug',
    },
  },
});
```

The supported levels, from most to least verbose, are:

- `trace`
- `debug`
- `info`
- `warn`
- `error`
- `silent`

### Default level

The `logging.level` value applies to every logger that does not have a specific
override. For example, the following enables informational messages across all
Cornerstone packages:

```ts
init({
  logging: {
    level: 'info',
  },
});
```

### Named logger levels

Use `logging.levels` when detailed output is needed from only part of
Cornerstone. Keys must be full logger names. A named level overrides the
default level for that logger.

Common DICOM Image Loader logger names include:

- `cs3d.dicomImageLoader.wadouri`
- `cs3d.dicomImageLoader.wadors`
- `cs3d.dicomImageLoader.createImage`
- `cs3d.dicomImageLoader.getInstanceModule`
- `cs3d.dicomImageLoader.rangeRequest`
- `cs3d.dicomImageLoader.streamRequest`

For example, this keeps the default at `warn` while enabling informational
WADO-URI messages:

```ts
init({
  logging: {
    level: 'warn',
    levels: {
      'cs3d.dicomImageLoader.wadouri': 'info',
    },
  },
});
```
