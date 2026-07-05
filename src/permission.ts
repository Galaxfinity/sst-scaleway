import { Input } from "@pulumi/pulumi";

export interface PermissionArgs {
  /**
   * Scaleway IAM permission set names, e.g. `["ObjectStorageFullAccess"]`.
   * See https://www.scaleway.com/en/docs/iam/reference-content/permission-sets/
   */
  permissionSetNames: Input<Input<string>[]>;
  /**
   * Scope the permission to specific projects. Defaults to the project the
   * function is deployed into (via `SCW_DEFAULT_PROJECT_ID`).
   */
  projectIds?: Input<Input<string>[]>;
  /**
   * Scope the permission to the whole organization instead of projects.
   */
  organizationId?: Input<string>;
}

export interface Permission extends PermissionArgs {
  type: "scaleway.permission";
}

/**
 * Include Scaleway IAM permissions in a `getSSTLink()` definition - the
 * Scaleway analog of `sst.aws.permission()`. Components like `Function`
 * collect these from their `link` array and provision an IAM application,
 * policy, and API key whose credentials are injected as `SCW_*` env vars.
 */
export function permission(args: PermissionArgs): Permission {
  return {
    type: "scaleway.permission" as const,
    ...args,
  };
}
