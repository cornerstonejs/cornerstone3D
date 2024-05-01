# External Dependencies

This module contains optional dependencies for including in CornerstoneJS, such
as the DICOM Microscopy Viewer component.  The intent is to allow further
dependencies to be added here which are not required at build time.  To add
an external dependency, edit the package.template.json file, possibly adding
the file dependency as well locally.  Then, use that depedency by adding a deployment
of it during the copy phase.

This mechanism is planned to be extended by allowing environment variables to
specify different sets of dependencies to be included, so that different builds
can be produces for use cases.
