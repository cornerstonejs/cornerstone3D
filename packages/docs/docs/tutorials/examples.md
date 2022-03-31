---
id: examples
title: Examples
---

import Link from '@docusaurus/Link';

# Examples

We have already written plenty number of examples that you can access [here](/docs/examples).
When you click on an example you will be taken to its example page. You can interact
with each example and see how it works.

<Link to="/docs/examples">
    <div id="open-example-button">
        Click here to open examples page
    </div>
</Link>

## Source Code and Debugging

If you are interested in looking into the source code for each example, we have added a link to the source code
when you open the chrome developer tools. You can see the following video to see how to do this. In summary,
after opening the chrome developer tools, click on the `console` and click on the `index.ts` that is
shown in the console.

You can put breakpoints at any line of the code and investigate the variables and functions that are
being called.

<!-- /For some reason vimeo gives CORS errors for embed -->
<div style={{padding:"56.25% 0 0 0", position:"relative"}}>
    <iframe src="https://player.vimeo.com/video/694244249?h=06d45e5a5f&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479&amp;dnt=1"
    frameBorder="0" allow="cross-origin-isolated" allowFullScreen style= {{ position:"absolute",top:0,left:0,width:"100%",height:"100%"}} title="Examples"></iframe>
</div>

## Run Examples Locally

You can also run each example locally. It should be noted that `Cornerstone3D` is a
monorepo and contains three packages (`core`, `tools`, `streaming-image-volume`). Examples
for each of these packages are included in the `examples` directory inside each package.
To run the example you need to change directory to the package root and run `yarn run example ExampleName` (this is a limitation
and we will be working on a better solution to run examples from the root of the monorepo).

1. Clone the repository
2. `yarn install`
3. Run example
   - For `core` examples:
   ```bash
   cd packages/core
   yarn run example ExampleName
   # for instance:
   # yarn run example volumeAPI
   ```
   - For `tools` examples:
   ```bash
   cd packages/tools
   yarn run example ExampleName
   # for instance:
   # yarn run example petCt
   ```
   - For `streaming-image-volume` examples:
   ```bash
   cd packages/streaming-image-volume
   yarn run example ExampleName
   ```

:::note Important
Example names are case sensitive, and they match their folder name
:::
