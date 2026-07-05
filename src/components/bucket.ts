import { ComponentResourceOptions } from "@pulumi/pulumi";
// Imported as `scwSdk`: SST's bundler injects `import * as <alias> from ...`
// for every registered provider into every bundled file, so this identifier
// must collide neither with "scaleway" nor with our own "scw" alias.
import * as scwSdk from "@pulumiverse/scaleway";
import { Component, Transform, transform } from "../internal/component.js";
import { LinkDefinition } from "../internal/link.js";
import { physicalName } from "../internal/naming.js";
import { permission } from "../permission.js";

export interface BucketArgs {
  /**
   * Transform how this component creates its underlying resources.
   */
  transform?: {
    /**
     * Transform the Scaleway Object Storage bucket resource.
     */
    bucket?: Transform<scwSdk.object.BucketArgs>;
  };
}

/**
 * The `Bucket` component creates a Scaleway Object Storage bucket
 * (S3-compatible).
 *
 * @example
 * ```ts title="sst.config.ts"
 * const bucket = new Bucket("MyBucket");
 *
 * new Function("MyFunction", {
 *   handler: "src/index.handler",
 *   link: [bucket],
 * });
 * ```
 */
export class Bucket extends Component {
  private bucket: scwSdk.object.Bucket;

  constructor(name: string, args: BucketArgs = {}, opts?: ComponentResourceOptions) {
    super("sst-scaleway:index:Bucket", name, args, opts);

    this.bucket = new scwSdk.object.Bucket(
      ...transform(
        args.transform?.bucket,
        `${name}Bucket`,
        {
          name: physicalName(63, name).toLowerCase(),
        },
        // The generated physical name contains a random suffix; ignore it on
        // diff so the bucket isn't replaced on every deploy.
        { parent: this, ignoreChanges: ["name"] },
      ),
    );
  }

  /**
   * The generated name of the bucket.
   */
  public get name() {
    return this.bucket.name;
  }

  /**
   * The S3-compatible endpoint of the bucket.
   */
  public get endpoint() {
    return this.bucket.endpoint;
  }

  /**
   * The underlying resources this component creates.
   */
  public get nodes() {
    return {
      bucket: this.bucket,
    };
  }

  /** @internal */
  public getSSTLink(): LinkDefinition {
    return {
      properties: {
        name: this.name,
        endpoint: this.endpoint,
      },
      include: [
        permission({
          permissionSetNames: ["ObjectStorageFullAccess"],
        }),
      ],
    };
  }
}
