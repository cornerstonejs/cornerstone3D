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

## generate-llms-txt.js

This script generates a llms.txt file that follows the [llms.txt specification](https://llmstxt.site) by creating an index of all the markdown files that have been copied to the `/docs/llm` directory.

### Purpose

The llms.txt file provides an overview of all available documentation in a format that's optimized for use with Large Language Models (LLMs). It creates a structured index that LLMs can use to efficiently navigate and find information in the documentation.

### Access URL

After deployment, the llms.txt file can be accessed at:

- `https://cornerstonejs.org/llms.txt`

### Implementation

The script is automatically run as part of the `build:docs` command (after `prepare-markdown-files.js`) and will:

1. Scan all the markdown files that were copied to the `/docs/llm` directory
2. Extract titles and summaries from the frontmatter of each file
3. Organize them into sections based on their directory structure
4. Generate a single llms.txt file in the standard format with links to all the documentation files
5. Save the file to the build directory root so it will be accessible at the root of the website

You can also run this script manually with (after running `prepare-markdown-files.js`):

```bash
cd packages/docs
bun run generate-llms-txt
```
