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
You can run each example by using its name as an argument to the `example` script. For instance,
It should be noted that the example name is not case sensitive, and even it can
suggest the name of the example you are looking for if you make a typo.

```bash

1. Clone the repository
2. `yarn install`
3. `yarn run example petct` // this should be run from the root of the repository

```

:::note Important
Use the root of the repository as the working directory when running the example.
Previously, you had to run the example in each package directory. This is no longer the case.
:::
