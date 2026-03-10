import type {
  BaseViewportRenderContext,
  DataAttachmentOptions,
  LogicalDataObject,
  RenderPathDefinition,
  RenderPathResolver,
  RenderingAdapter,
  ViewportKind,
} from './ViewportArchitectureTypes';

export class DefaultRenderPathResolver implements RenderPathResolver {
  private paths: RenderPathDefinition[] = [];

  register<TContext extends BaseViewportRenderContext>(
    path: RenderPathDefinition<TContext>
  ): void {
    const existingPath = this.paths.find(
      (candidate) => candidate.id === path.id
    );

    if (existingPath) {
      return;
    }

    this.paths.push(path);
  }

  resolve<TContext extends BaseViewportRenderContext>(
    viewportKind: ViewportKind,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): RenderingAdapter<TContext> {
    const path = this.paths.find(
      (candidate) =>
        candidate.viewportKind === viewportKind &&
        candidate.matches(data, options)
    );

    if (!path) {
      throw new Error(
        `No render path for ${viewportKind}/${data.kind}/${options.role}/${options.renderMode}`
      );
    }

    return path.createAdapter() as RenderingAdapter<TContext>;
  }
}

export const defaultRenderPathResolver = new DefaultRenderPathResolver();
