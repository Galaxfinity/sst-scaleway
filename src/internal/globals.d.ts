/**
 * Ambient declarations for the values SST's CLI injects when it bundles
 * sst.config.ts and everything it imports (including this package).
 *
 * `$app`, `$cli` and `$dev` are esbuild `define`s - the identifiers below are
 * replaced with literals at bundle time. This only works because this package
 * is published as plain, unminified ESM; do not add a minifier to the build.
 */
declare const $app: {
  readonly name: string;
  readonly stage: string;
  readonly removal?: "remove" | "retain" | "retain-all";
  readonly protect?: boolean;
  readonly providers?: Record<string, unknown>;
};

declare const $dev: boolean;

declare const $cli: {
  readonly command: string;
  readonly paths: {
    readonly home: string;
    readonly root: string;
    readonly work: string;
    readonly platform: string;
  };
};
