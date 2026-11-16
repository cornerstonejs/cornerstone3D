/**
 * Puts the scalar texture that the renderable holds now in
 * `model.scalarTextures[0]` of an OpenGL mapper node.
 *
 * The view node factory passes the scalar texture of the renderable to a node
 * once, when it creates the node. A render path binds its strategy texture
 * later through `setScalarTexture`, so each mapper node calls this at the
 * start of each build, and draws the texture that is bound now. Only
 * component 0 gets a strategy texture: a multi-input volume has no strategy.
 */
export default function takeBoundScalarTexture(model) {
  const texture = model.renderable.getScalarTexture?.();

  if (!model.scalarTextures) {
    model.scalarTextures = [];
  }

  if (texture && texture !== model.scalarTextures[0]) {
    model.scalarTextures[0] = texture;
    // The build key of the old texture must not match the new texture.
    if (model.scalarTextureStrings) {
      model.scalarTextureStrings[0] = undefined;
    }
  }
}
