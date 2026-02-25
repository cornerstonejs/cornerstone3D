---
id: linking
title: Linking Cornerstone Libraries
summary: Step-by-step guide for linking local Cornerstone libraries with OHIF for development, including troubleshooting tips and workflows for multiple libraries
---

# Linking Cornerstone Libraries with OHIF for Development

Often time you will want to link to a package to Cornerstone3D, this might be
to develop a feature, to debug a bug or for other reasons.

Also, sometimes you may want to link the external packages to include libraries into
your build that are not direct dependencies but are dynamically loaded. See the externals/README.md
file for details.

## pnpm Link

There are various ways to link to a package. The most common way is to use
[`pnpm link`](https://pnpm.io/cli/link).

This guide explains how to link local Cornerstone libraries for development with OHIF.

## Prerequisites

- Local clone of OHIF Viewer
- Local clone of desired Cornerstone libraries (@cornerstonejs/core, @cornerstonejs/tools, etc.)
- pnpm package manager

## Steps to Link Libraries

1. **Prepare the Cornerstone Library**

   Navigate to the Cornerstone library directory you want to link (e.g., @cornerstonejs/core):

   ```bash
   cd packages/core
   ```

   Unlink any existing links first:

   ```bash
   pnpm unlink
   ```

   Create the link:

   ```bash
   pnpm link --global
   ```

   Build the package to ensure latest changes:

   ```bash
   pnpm run dev
   ```

2. **Link in OHIF**

   In your OHIF project directory:

   ```bash
   pnpm link --global @cornerstonejs/core
   ```

   Start OHIF:

   ```bash
   pnpm run dev
   ```

## Working with Multiple Libraries

You can link multiple Cornerstone libraries simultaneously. For example, to link both core and tools:

```bash
# In cornerstone/packages/core
pnpm unlink
pnpm link --global
pnpm run dev

# In cornerstone/packages/tools
pnpm unlink
pnpm link --global
pnpm run dev

# In OHIF
pnpm link --global @cornerstonejs/core
pnpm link --global @cornerstonejs/tools
```

## Verifying the Link

1. Make a visible change in the linked library (e.g., modify a line width in tools)
2. Rebuild the library using `pnpm run dev`
3. The changes should reflect in OHIF automatically

## Important Notes

- Always run `pnpm run dev` in the Cornerstone library after making changes
- Due to ESM migration in Cornerstone 3D 2.0, linking process is simpler than before
- Remove links when finished using `pnpm unlink` in both projects

## Troubleshooting

If changes aren't reflecting:

1. Ensure the library is rebuilt (`pnpm run dev`)
2. Check the console for any linking errors
3. Verify the correct library version is linked using the browser console

## Video Tutorials

<iframe width="560" height="315" src="https://www.youtube.com/embed/IOXQ1od6DZA?si=3QP4rppQgedJn7y8" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Tips

1. `pnpm link` is actually a symlink between packages. If your linking is not working,
   check out the `node_modules` in the `Cornerstone3D` directory to see if the symlink
   has been created (the updated source code - not the dist - is available in the `node_modules`).

2. If your `debugger` is not hitting, you might want to change the `mode` setting
   in the webpack to be `development` instead of `production`. This ensures, minification
   is not applied to the source code.

3. Use a more verbose source map for debugging. You can read more [here](https://webpack.js.org/configuration/devtool/)
