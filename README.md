# sst-scaleway

[![Build](https://img.shields.io/github/actions/workflow/status/Galaxfinity/sst-scaleway/ci.yml?branch=main&label=build)](https://github.com/Galaxfinity/sst-scaleway/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/Galaxfinity/sst-scaleway/release.yml?label=release)](https://github.com/Galaxfinity/sst-scaleway/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/%40galaxfinity%2Fsst-scaleway?label=npm)](https://www.npmjs.com/package/@galaxfinity/sst-scaleway)
[![npm downloads](https://img.shields.io/npm/dm/%40galaxfinity%2Fsst-scaleway)](https://www.npmjs.com/package/@galaxfinity/sst-scaleway)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

First-class [SST](https://sst.dev) components for [Scaleway](https://www.scaleway.com) - `Function` with Lambda-style esbuild bundling, `Bucket`, and SST linking that just works.

Published as [`@galaxfinity/sst-scaleway`](https://www.npmjs.com/package/@galaxfinity/sst-scaleway).

```ts title="sst.config.ts"
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "my-app",
      home: "local",
      providers: {
        scaleway: "1.51.1",
        "@galaxfinity/sst-scaleway": "0.0.1",
      },
    };
  },
  async run() {
    // `scw` is injected as a typed global - no import needed.
    const bucket = new scw.Bucket("MyBucket");

    const fn = new scw.Function("MyApi", {
      handler: "src/index.handler",
      link: [bucket],
    });

    return { url: fn.url };
  },
});
```

```ts title="src/index.ts"
import { Resource } from "sst";

export async function handler() {
  return {
    statusCode: 200,
    body: JSON.stringify({ bucket: Resource.MyBucket.name }),
  };
}
```

Linked resources are injected as `SST_RESOURCE_*` env vars - the exact wire format SST's own components use - so the `sst` SDK's `Resource` object works unchanged. Resources linked with `scaleway.permission` includes get a dedicated IAM application + policy + API key, injected as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` secret env vars.

## Setup

```sh
sst add scaleway
sst add @galaxfinity/sst-scaleway
```

This registers both as providers and makes the typed `scw.*` global available in your `sst.config.ts`, exactly like `aws.*` or `scaleway.*`. Credentials come from the usual Scaleway env vars: `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_REGION`.

Alternatively, skip `sst add` and use it as a normal package:

```sh
pnpm add @galaxfinity/sst-scaleway
```

```ts
async run() {
  const scw = await import("@galaxfinity/sst-scaleway");
  new scw.Bucket("MyBucket");
}
```

No other dependencies needed either way - `@pulumi/pulumi`, `@pulumiverse/scaleway`, `esbuild`, and `archiver` all resolve from SST's own vendored platform at runtime.

## Components

| Component  | Wraps                                                         | Status |
| ---------- | ------------------------------------------------------------- | ------ |
| `Function` | `functions.Namespace` + `functions.Function` + IAM key wiring | ✅      |
| `Bucket`   | `object.Bucket`                                               | ✅      |
| `Postgres` | `databases.ServerlessDatabase`                                | 🚧      |
| `Queue`    | `mnq.Sqs` + `mnq.SqsQueue` + `mnq.SqsCredentials`             | 🚧      |
| `Cron`     | `functions.Cron`                                              | 🚧      |

All functions of an app/stage share one Functions namespace by default (override with `namespace`). Every component supports SST-style `transform` and exposes its raw resources via `nodes`.

## How it integrates with SST (design notes)

- **Linking is duck-typed.** SST detects linkability via `"getSSTLink" in obj` - no dependency on SST internals is needed, and none is taken. The published `sst` package doesn't ship the component platform, so this is the supported surface.
- **The `scw` global rides the provider mechanism.** `sst add` accepts any npm package whose package.json carries a `pulumi` field; SST then installs it into `.sst/platform/node_modules`, injects `import * as scw from "@galaxfinity/sst-scaleway"` into the config bundle, and generates the typed global in `config.d.ts`. This package is not a real Pulumi provider - it exports an empty `ProviderArgs` and is never instantiated by the engine - it only borrows the registration channel. If a future SST version tightens that check, the dynamic-import style above keeps working.
- **`sst dev`**: components deploy normally. Live-invoke is SST-CLI-internal (Go RPC) and not available to third-party components.
- **Don't name an import after a provider alias.** SST injects the provider imports into every bundled file; internally this package imports the Scaleway SDK as `scwSdk` to avoid colliding with both `scaleway` and its own `scw` alias.
- Published as plain, unminified ESM - `$app`/`$dev`/`$cli` are esbuild defines that must survive in the shipped JS.

## Example

See [`examples/basic`](examples/basic) - a Bucket linked into a Function using the `scw.*` global. From that directory: `pnpm install && pnpm exec sst deploy`.

> **Pre-publish note:** until `@galaxfinity/sst-scaleway` is on npm, a fresh `sst install` cannot resolve the provider entry and the example needs the local dev state re-applied (provider-lock entry with alias `scw`, a symlink in `.sst/platform/node_modules/@galaxfinity/sst-scaleway` to the repo root, and the `scw` global in `.sst/platform/config.d.ts`). After the first release this is exactly what `sst add @galaxfinity/sst-scaleway` generates.

## Status

Early, but verified end to end against a real Scaleway account: `Function` + `Bucket` deploy live, and the linked bucket name is readable at runtime through the `sst` SDK's `Resource` object (bundling, zip upload, ESM handler convention, linking, and IAM permission wiring all confirmed). The `sst add` flow requires the package to be published and will be re-verified after the first release.

Known limitation: the auto-provisioned IAM API key is created with a ~1-year expiration (some organizations enforce this). Rotation before expiry is currently manual - delete the key in the console and redeploy.

## Trademarks & disclaimer

This is an independent, community-maintained project. It is **not** affiliated with, endorsed by, or sponsored by SCALEWAY SAS or by the SST team. "Scaleway" is a trademark of SCALEWAY SAS; "SST" and "Pulumi" are trademarks of their respective owners. These names are used solely to describe what this package is compatible with.

Portions of the internal helpers are derived from SST's MIT-licensed source - see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
