import {
  ComponentResource,
  ComponentResourceOptions,
  Inputs,
  runtime,
} from "@pulumi/pulumi";

/**
 * Mirrors SST's removal policy (platform/src/auto/run.ts in the SST repo):
 * with `removal: "retain"`, data-carrying resources survive removal while
 * everything else is deleted. SST's own transformation only lists aws/*
 * types, so we register the same rule for the Scaleway data resources.
 * (`removal: "retain-all"` needs nothing here — SST applies it to every
 * resource regardless of type.)
 */
const RETAINED_ON_REMOVAL = [
  "scaleway:index/objectBucket:ObjectBucket",
  "scaleway:index/sdbDatabase:SdbDatabase",
];

let removalPolicyRegistered = false;
function ensureRemovalPolicy() {
  if (removalPolicyRegistered) return;
  removalPolicyRegistered = true;
  if (typeof $app === "undefined") return;
  runtime.registerStackTransformation((args) => {
    if ($app.removal === "retain" && RETAINED_ON_REMOVAL.includes(args.type)) {
      args.opts.retainOnDelete = args.opts.retainOnDelete ?? true;
      return args;
    }
    return undefined;
  });
}

/**
 * Helper type to inline nested types in editor tooltips.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Mirrors SST's `Transform<T>`: either a partial args object merged over the
 * defaults, or a callback that mutates args/opts in place.
 */
export type Transform<T> =
  | Partial<T>
  | ((args: T, opts: ComponentResourceOptions, name: string) => undefined | void);

export function transform<T extends object>(
  t: Transform<T> | undefined,
  name: string,
  args: T,
  opts: ComponentResourceOptions,
) {
  if (typeof t === "function") {
    t(args, opts, name);
    return [name, args, opts] as const;
  }

  return [name, { ...args, ...t }, opts] as const;
}

/**
 * Base class for all sst-scaleway components.
 *
 * Deliberately NOT SST's own Component class - the published `sst` package
 * does not ship the component platform, and SST's linking machinery is
 * duck-typed (`"getSSTLink" in obj`), so extending a plain Pulumi
 * ComponentResource is the supported integration surface.
 */
export class Component extends ComponentResource {
  constructor(
    type: string,
    name: string,
    args?: Inputs,
    opts?: ComponentResourceOptions,
  ) {
    if (name.includes(" ")) {
      throw new Error(
        `Invalid component name "${name}" (${type}). Component names cannot contain spaces.`,
      );
    }
    ensureRemovalPolicy();
    super(type, name, args, opts);
  }
}
