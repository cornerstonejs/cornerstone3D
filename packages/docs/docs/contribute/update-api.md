---
id: update-api
---

# API Updating

We have adopted the [api-extractor](https://api-extractor.com/) tool to extract the public API from the codebase.
Having a consistent API is the key to making our library easy to use and build upon; therefore,
for each Pull Request (PR) we extract the API for the PR and compare it to the API of the base branch.

If you have unintentionally changed the public API of the library, one of our checks in Github would
catch it and notify you by an Error.

If the change to the API is intentional, you need to run `yarn run build:update-api` to update the API.
This will create set of new API summary files (located at `common/reviews/api/*`) and you need to add and commit them
with your changes, in order for the Error to be fixed.
