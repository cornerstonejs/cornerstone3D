---
id: documentation
---

# Writing Documentation

We strongly recommend for each Pull Request you make you ask yourself the following questions:

- Does this change require change of documentation too?
- Is this a new feature? If so, does it need to be documented?

If the answer is Yes, it is recommended to document it.

## Running Documentation Page

To run documentation you need to execute

```sh
cs packages/docs/

yarn run dev
```

This will open up port `3333` and start the documentation server. Then you can
visit `http://localhost:3333` to see the documentation page.

:::note Important
Running the documentation server will probably fail complaining about the `example.md`
file not being found. This is because the `example.md` file is created at build time
and is not available in the repository. To fix this, you can run `yarn run docs:ci`
to generate the `example.md` file, and then run the documentation server.
:::


## Potential problems you may encounter

### Side bar not showing up
There is a bug in your markdown file, likely in the way you are using the markdown syntax.
