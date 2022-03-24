---
id: streaming
---

# Streaming of Volume data

You don't need to wait for all of the volume to load to have an initial view. Below, you can see
    streaming of two volumes that are simultaneously loaded into the scenes for a 3x3 PET/CT fusion layout with a MIP view on the right.


## Creating Volumes From Images

During the design of `Cornerstone3D` we considered the following options for loading image volumes:

1. Loading each image separately, then creating a volume from them
2. Fetching metadata from all images, create a volume before hand, then insert each image inside the volume one by one as they are loaded

We chose option 2. Below we will explain the rationale behind this choice, and the advantages and disadvantages of each option.

### [Not Implemented]: Option 1


### [Implemented]: Option2
