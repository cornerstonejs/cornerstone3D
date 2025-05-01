# Cornerstone3D Documentation Scripts

This directory contains utility scripts for the Cornerstone3D documentation.

## prepare-markdown-files.js

This script copies all markdown files from the docs directory (excluding `api/` and `assets/`) to a `/docs/llm` directory in the build output, making them available as static markdown files that can be accessed directly without the Docusaurus UI.

### Purpose

These files are made available for easy access by LLMs and other tools that need to retrieve the raw markdown content without the surrounding Docusaurus UI elements.

### Access URLs

After deployment, the markdown files can be accessed at URLs like:

- `https://cornerstonejs.org/docs/llm/tutorials/basic-stack.md`
- `https://cornerstonejs.org/docs/llm/concepts/cornerstone-core/volumes.md`

### Implementation

The script is automatically run as part of the `build:docs` command and will:

1. Find all markdown files in the `/packages/docs/docs/` directory (excluding api/ and assets/)
2. Copy them to `/packages/docs/build/docs/llm/` preserving the directory structure
3. These files are then deployed to the website along with the rest of the built documentation

You can also run this script manually with:

```bash
cd packages/docs
bun run prepare-markdown-files
```
