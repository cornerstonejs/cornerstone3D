# External Dependencies

This module contains optional dependencies for including in CornerstoneJS, such
as the DICOM Microscopy Viewer component.  The intent is to allow further
dependencies to be added here which are not required at build time, or which are
local to your own build.
To add a default external dependency, create a sub-folder named `external-<NAME>`,
for default dependencies, and `local-<NAME>` for site specific dependencies.

You can then install/build with
`yarn install --force --ignore-optional`
