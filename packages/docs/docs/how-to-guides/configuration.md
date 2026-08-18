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

Cornerstone writes its messages with [loglevel](https://github.com/pimterry/loglevel),
through the same log root as dcmjs. Configure the logs with the loglevel
interface, not with the `init` configuration. Thus one interface controls the
logs of Cornerstone, of dcmjs, and of the other components of your application.

```ts
import { logging } from '@cornerstonejs/utils';

logging.log.getLogger('cs3d.dicomImageLoader.wadouri').setLevel('info');
```

The levels, from the most messages to the fewest messages, are:

- `trace`
- `debug`
- `info`
- `warn`
- `error`
- `silent`

### Logger names

A logger name has this structure:

```
cs3d.<PACKAGE>.<PATH>.<FILEORAREA>
```

- `cs3d` is the root of all Cornerstone logs.
- `<PACKAGE>` is the package, for example `core`, `tools`, `dicomImageLoader`,
  `polymorphicSegmentation`, `labelmapInterpolation`, `adapters`, `metadata` or
  `ai`.
- `<PATH>` is the folder in the source of that package. It can have more than
  one part, and a file at the root of the package has no path.
- `<FILEORAREA>` is the file, or the area of the code when the messages come
  from more than one file.

Examples of names:

- `cs3d.core.RenderingEngine.StackViewport`
- `cs3d.core.utilities.VoxelManager`
- `cs3d.dicomImageLoader.wadouri`
- `cs3d.adapters.Cornerstone3D.MeasurementReport`

Two loggers are not below `cs3d`: `consistency.dicom` and `consistency.image`.
These loggers are on the root of dcmjs, because dcmjs writes the same
consistency messages.

### Set a level

Logger names are independent strings; dots in a name do not create a
parent and child relationship. Setting a named logger's level therefore affects
only that exact logger. To find the loggers that exist, use
`logging.log.getLoggers()`.

```ts
import { logging } from '@cornerstonejs/utils';

// One exact logger
logging.log.getLogger('cs3d.core.RenderingEngine').setLevel('debug');

// All existing loggers whose names start with an area prefix
const prefix = 'cs3d.core.RenderingEngine';
Object.entries(logging.log.getLoggers()).forEach(([name, logger]) => {
  if (name === prefix || name.startsWith(`${prefix}.`)) {
    logger.setLevel('debug');
  }
});

// Update the root, then update existing loggers that do not have their own level
logging.log.setLevel('warn');
logging.log.rebuild();
```

You can set a level at any time, and the new level is immediately applicable.
Named loggers created after a root level change inherit the new root level.
Named loggers that already exist keep their inherited level until you call
`logging.log.rebuild()`. Thus you can also give this control to your users, for
example in a menu for support.

### Send the logs to a different location

loglevel lets you replace the function that makes each log method. Use this to
send the messages to a server, to a file, or to the interface of your
application. Call `setLevel` after you replace the function, because the new
methods are made at that time.

```ts
import { logging } from '@cornerstonejs/utils';

const logger = logging.log.getLogger('cs3d.core.RenderingEngine');
const originalFactory = logger.methodFactory;

logger.methodFactory = (methodName, level, loggerName) => {
  const originalMethod = originalFactory(methodName, level, loggerName);

  return (...args) => {
    originalMethod(...args);

    if (methodName === 'warn' || methodName === 'error') {
      myTelemetry.send({ logger: String(loggerName), methodName, args });
    }
  };
};

logger.setLevel(logger.getLevel());
```
