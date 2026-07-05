import { Input, Output, all, output } from "@pulumi/pulumi";

/**
 * The shape SST's linking machinery expects from `getSSTLink()`.
 * See platform/src/components/link.ts in the SST repo — linkability is
 * duck-typed via `"getSSTLink" in obj`, which is why this package needs no
 * import from SST itself.
 */
export interface LinkDefinition<
  Properties extends Record<string, any> = Record<string, any>,
> {
  properties: Properties;
  include?: {
    type: string;
    [key: string]: any;
  }[];
}

export interface Linkable {
  urn: Output<string>;
  getSSTLink(): LinkDefinition;
}

export function isLinkable(obj: any): obj is Linkable {
  return obj !== null && typeof obj === "object" && "getSSTLink" in obj;
}

function normalizeType(type: string) {
  return type.replaceAll(":", ".");
}

/**
 * Build the `SST_RESOURCE_*` environment variables for a list of linked
 * resources — the same wire format SST's own components inject, so the
 * `Resource` object from the `sst` SDK works unchanged at runtime.
 */
export function linkEnvironment(
  links?: Input<any[]>,
): Output<Record<string, string>> {
  const entries = output(links ?? []).apply((ls) => {
    for (const l of ls) {
      if (l === undefined || l === null) {
        throw new Error("An undefined link was passed into a `link` array.");
      }
    }
    return all(
      ls.filter(isLinkable).map((l) =>
        all([l.urn, output(l.getSSTLink().properties)]).apply(
          ([urn, properties]) => ({
            name: urn.split("::").at(-1)!,
            value: JSON.stringify({
              ...properties,
              type: normalizeType(urn.split("::").at(-2)!),
            }),
          }),
        ),
      ),
    );
  });

  return entries.apply((items) => {
    const env: Record<string, string> = {
      SST_RESOURCE_App: JSON.stringify({
        name: $app.name,
        stage: $app.stage,
      }),
    };
    for (const item of items) {
      env[`SST_RESOURCE_${item.name}`] = item.value;
    }
    return env;
  });
}

/**
 * Collect `include` entries of a given type from linked resources —
 * mirrors SST's `Link.getInclude`. Used by Function to gather
 * `scaleway.permission` entries and provision IAM credentials.
 */
export function getInclude<T>(
  type: string,
  links?: Input<any[]>,
): Output<T[]> {
  return output(links ?? []).apply((ls) => {
    const includes = ls
      .filter(isLinkable)
      .flatMap((l) => (l.getSSTLink().include ?? []).filter((i) => i.type === type));
    return output(includes) as Output<T[]>;
  }) as Output<T[]>;
}
