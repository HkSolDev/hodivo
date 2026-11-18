import { vendorRoot } from './vendor';

type Encoder = (
  data: ImageData,
  options: { quality: number; progressive: boolean },
) => Promise<ArrayBuffer>;
let encoder: Promise<Encoder> | undefined;

export function loadMozJpeg() {
  const url = `${vendorRoot}/mozjpeg/encode.js`;
  encoder ??= import(/* webpackIgnore: true */ url)
    .then(
      async (module: {
        default: Encoder;
        init(
          wasm: undefined,
          options: { locateFile(name: string): string },
        ): Promise<void>;
      }) => {
        await module.init(undefined, {
          locateFile: (name) => `${vendorRoot}/mozjpeg/codec/enc/${name}`,
        });
        return module.default;
      },
    )
    .catch((error) => {
      encoder = undefined;
      throw error;
    });
  return encoder;
}
