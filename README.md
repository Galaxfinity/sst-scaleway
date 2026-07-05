# sst-scaleway

[![Build](https://img.shields.io/github/actions/workflow/status/Galaxfinity/sst-scaleway/ci.yml?branch=main&label=build)](https://github.com/Galaxfinity/sst-scaleway/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/Galaxfinity/sst-scaleway/release.yml?label=release)](https://github.com/Galaxfinity/sst-scaleway/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/%40galaxfinity%2Fsst-scaleway?label=npm)](https://www.npmjs.com/package/@galaxfinity/sst-scaleway)
[![npm downloads](https://img.shields.io/npm/dm/%40galaxfinity%2Fsst-scaleway)](https://www.npmjs.com/package/@galaxfinity/sst-scaleway)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

First-class [SST](https://sst.dev) components for [Scaleway](https://www.scaleway.com) - `Function` with Lambda-style esbuild bundling, `Bucket`, and SST linking that just works.

Published as [`@galaxfinity/sst-scaleway`](https://www.npmjs.com/package/@galaxfinity/sst-scaleway).

```ts title='sst.config.ts'
/// <reference path='./.sst/platform/config.d.ts' />

export default $config({
  app(input) {
    return {
      name: 'my-app',
      home: 'local',
      providers: {
        scaleway: '1.51.1',
        '@galaxfinity/sst-scaleway': '0.2.0',
      },
    };
  },
  async run()
  {
    // `scw` is injected as a typed global - no import needed.
    const bucket = new scw.Bucket('MyBucket');

    const fn = new scw.Function('MyApi', {
      handler: 'src/index.handler',
      link: [bucket],
    });

    return { url: fn.url };
  },
});
```

```ts title='src/index.ts'
import { Resource } from 'sst';

export const handler = async () =>
{
  return {
    statusCode: 200,
    body: JSON.stringify({ bucket: Resource.MyBucket.name }),
  };
}
```

Linked resources are injected as `SST_RESOURCE_*` env vars - the exact wire format SST's own components use - so the `sst` SDK's `Resource` object works unchanged. Resources linked with `scaleway.permission` includes get a dedicated IAM application + policy + API key, injected as `SST_SCALEWAY_ACCESS_KEY` / `SST_SCALEWAY_SECRET_KEY` / `SST_SCALEWAY_APPLICATION_ID` secret env vars (the `SCW_*` prefix is reserved by Scaleway).

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
  const scw = await import('@galaxfinity/sst-scaleway');
  new scw.Bucket('MyBucket');
}
```

No other dependencies needed either way - `@pulumi/pulumi`, `@pulumiverse/scaleway`, `esbuild`, and `archiver` all resolve from SST's own vendored platform at runtime.

## Components

| Component  | Wraps                                                         | Status |
| ---------- | ------------------------------------------------------------- | ------ |
| `Function` | `functions.Namespace` + `functions.Function` + IAM key wiring | ✅      |
| `Bucket`   | `object.Bucket`                                               | ✅      |
| `Postgres` | `databases.ServerlessDatabase` (scale-to-zero PostgreSQL)     | ✅      |
| `Queue`    | `mnq.Sqs` + `mnq.SqsQueue` + `mnq.SqsCredentials` + `functions.Trigger` | ✅      |
| `Cron`     | `functions.Cron`                                              | ✅      |

All functions of an app/stage share one Functions namespace by default (override with `namespace`). Every component supports SST-style `transform` and exposes its raw resources via `nodes`.

Consume queue messages with `queue.subscribe("src/consumer.handler")` - it creates a private function plus a `functions.Trigger`, and the message body arrives as the request body. If MNQ SQS is already activated in your project outside this app, pass `activateSqs: false` to `Queue` (activation is project-level and can only exist once).

IAM API keys provisioned for linked permissions expire at fixed half-year boundaries (Jun 30 / Dec 31, always 6-12 months out) and rotate automatically on the first deploy of each half-year - deploy at least once per half-year to never hit an expiry.

## How it integrates with SST (design notes)

- **Linking is duck-typed.** SST detects linkability via `'getSSTLink' in obj` - no dependency on SST internals is needed, and none is taken. The published `sst` package doesn't ship the component platform, so this is the supported surface.
- **The `scw` global rides the provider mechanism.** `sst add` accepts any npm package whose package.json carries a `pulumi` field; SST then installs it into `.sst/platform/node_modules`, injects `import * as scw from '@galaxfinity/sst-scaleway'` into the config bundle, and generates the typed global in `config.d.ts`. This package is not a real Pulumi provider - it exports an empty `ProviderArgs` and is never instantiated by the engine - it only borrows the registration channel. If a future SST version tightens that check, the dynamic-import style above keeps working.
- **`sst dev`**: components deploy normally. Live-invoke is SST-CLI-internal (Go RPC) and not available to third-party components.
- **Don't name an import after a provider alias.** SST injects the provider imports into every bundled file; internally this package imports the Scaleway SDK as `scwSdk` to avoid colliding with both `scaleway` and its own `scw` alias.
- Published as plain, unminified ESM - `$app`/`$dev`/`$cli` are esbuild defines that must survive in the shipped JS.

## Example

See [`examples/basic`](examples/basic) - a Bucket linked into a Function using the `scw.*` global. From that directory: `pnpm install && pnpm exec sst install && pnpm exec sst deploy`.

## Status

Early, but every component is verified end to end against a real Scaleway account with the published package: `sst add @galaxfinity/sst-scaleway` resolves from the registry and generates the typed `scw` global; a live request through a deployed `Function` reads a linked `Bucket`, queries a linked `Postgres` (IAM-authenticated), and publishes to a linked `Queue`; a `Cron` fires the function on schedule; and a `queue.subscribe()` trigger consumes the messages and writes them to the bucket via S3 with the injected credentials. API key auto-rotation (create-before-delete, zero downtime) has been observed live.

Known limitation: the `activateSqs: false` escape hatch for projects with pre-existing MNQ SQS activation is implemented but the conflict scenario itself hasn't been reproduced yet.

## Trademarks & disclaimer

This is an independent, community-maintained project. It is **not** affiliated with, endorsed by, or sponsored by SCALEWAY SAS or by the SST team. 'Scaleway' is a trademark of SCALEWAY SAS; 'SST' and 'Pulumi' are trademarks of their respective owners. These names are used solely to describe what this package is compatible with.

Portions of the internal helpers are derived from SST's MIT-licensed source - see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
