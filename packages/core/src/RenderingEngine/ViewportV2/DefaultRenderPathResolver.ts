import type {
  BaseViewportRenderContext,
  DataAddOptions,
  LoadedData,
  RenderPathDefinition,
  RenderPathResolver,
} from './ViewportArchitectureTypes';
import type ViewportType from '../../enums/ViewportType';

export class DefaultRenderPathResolver implements RenderPathResolver {
  private paths: RenderPathDefinition[] = [];

  register<
    TRootContext extends BaseViewportRenderContext,
    TAdapterContext extends BaseViewportRenderContext,
  >(path: RenderPathDefinition<TRootContext, TAdapterContext>): void {
    const existingPath = this.paths.find(
      (candidate) => candidate.id === path.id
    );

    if (existingPath) {
      return;
    }

    this.paths.push(path);
  }

  resolve<TContext extends BaseViewportRenderContext>(
    type: ViewportType,
    data: LoadedData,
    options: DataAddOptions
  ): RenderPathDefinition<TContext, BaseViewportRenderContext> {
    const path = this.paths.find(
      (candidate) => candidate.type === type && candidate.matches(data, options)
    );

    if (!path) {
      throw new Error(
        `No render path for ${type}/${data.type}/${options.renderMode}`
      );
    }

    return path as RenderPathDefinition<TContext, BaseViewportRenderContext>;
  }
}

export const defaultRenderPathResolver = new DefaultRenderPathResolver();
