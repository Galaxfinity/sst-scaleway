/**
 * Provider args for SST's generated config.d.ts. This package is a component
 * library, not a real Pulumi provider - it carries a `pulumi` field in its
 * package.json solely so `sst add` accepts it and injects the typed `scw`
 * global. It has no settings of its own; configure the `scaleway` provider
 * instead.
 */
export interface ProviderArgs {}

export { Bucket, BucketArgs } from "./components/bucket.js";
export { Function, FunctionArgs } from "./components/function.js";
export { Postgres, PostgresArgs } from "./components/postgres.js";
export { Queue, QueueArgs } from "./components/queue.js";
export { Cron, CronArgs } from "./components/cron.js";
export { permission, Permission, PermissionArgs } from "./permission.js";
export { LinkDefinition, Linkable, isLinkable } from "./internal/link.js";
export { Transform } from "./internal/component.js";
