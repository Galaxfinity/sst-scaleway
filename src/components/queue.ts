import { ComponentResourceOptions, Input, output } from "@pulumi/pulumi";
// Imported as `scwSdk`: SST's bundler injects `import * as <alias> from ...`
// for every registered provider into every bundled file, so this identifier
// must collide neither with "scaleway" nor with our own "scw" alias.
import * as scwSdk from "@pulumiverse/scaleway";
import { Component, Transform, transform } from "../internal/component.js";
import { LinkDefinition } from "../internal/link.js";
import { physicalName } from "../internal/naming.js";

export interface QueueArgs {
  /**
   * Create a FIFO queue.
   * @default `false`
   */
  fifo?: Input<boolean>;
  /**
   * Transform how this component creates its underlying resources.
   */
  transform?: {
    /**
     * Transform the SQS queue resource.
     */
    queue?: Transform<scwSdk.mnq.SqsQueueArgs>;
    /**
     * Transform the runtime credentials (publish/receive) for linked
     * consumers.
     */
    credentials?: Transform<scwSdk.mnq.SqsCredentialsArgs>;
  };
}

// MNQ SQS is activated once per project, and queue management needs its own
// SQS credentials - both shared across all Queues of the stack.
let sqsActivation: scwSdk.mnq.Sqs | undefined;
let manageCredentials: scwSdk.mnq.SqsCredentials | undefined;
function getSqs() {
  if (!sqsActivation) {
    sqsActivation = new scwSdk.mnq.Sqs("SstScalewaySqs", {});
    manageCredentials = new scwSdk.mnq.SqsCredentials(
      "SstScalewaySqsManageCredentials",
      {
        name: physicalName(64, "sqs-manage"),
        permissions: { canManage: true },
      },
      { dependsOn: [sqsActivation], ignoreChanges: ["name"] },
    );
  }
  return { sqs: sqsActivation, manage: manageCredentials! };
}

/**
 * The `Queue` component creates a Scaleway MNQ queue (SQS-compatible).
 *
 * MNQ authenticates with its own credentials, not IAM - the link carries a
 * publish+receive credential pair, so any SQS client works at runtime.
 *
 * @example
 * ```ts title="sst.config.ts"
 * const queue = new Queue("MyQueue");
 *
 * new Function("MyApi", {
 *   handler: "src/index.handler",
 *   link: [queue],
 * });
 * ```
 *
 * ```ts title="src/index.ts"
 * import { Resource } from "sst";
 * import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
 *
 * const sqs = new SQSClient({
 *   region: Resource.MyQueue.region,
 *   endpoint: Resource.MyQueue.endpoint,
 *   credentials: {
 *     accessKeyId: Resource.MyQueue.accessKey,
 *     secretAccessKey: Resource.MyQueue.secretKey,
 *   },
 * });
 * await sqs.send(new SendMessageCommand({
 *   QueueUrl: Resource.MyQueue.url,
 *   MessageBody: "hello",
 * }));
 * ```
 */
export class Queue extends Component {
  private queue: scwSdk.mnq.SqsQueue;
  private credentials: scwSdk.mnq.SqsCredentials;
  private sqs: scwSdk.mnq.Sqs;

  constructor(name: string, args: QueueArgs = {}, opts?: ComponentResourceOptions) {
    super("sst-scaleway:index:Queue", name, args, opts);

    const { sqs, manage } = getSqs();
    this.sqs = sqs;

    this.queue = new scwSdk.mnq.SqsQueue(
      ...transform(
        args.transform?.queue,
        `${name}Queue`,
        {
          name: output(args.fifo).apply((fifo) =>
            fifo
              ? `${physicalName(59, name)}.fifo`
              : physicalName(64, name),
          ),
          fifoQueue: output(args.fifo).apply((fifo) => fifo ?? false),
          accessKey: manage.accessKey,
          secretKey: manage.secretKey,
        },
        { parent: this, ignoreChanges: ["name"] },
      ),
    );

    this.credentials = new scwSdk.mnq.SqsCredentials(
      ...transform(
        args.transform?.credentials,
        `${name}Credentials`,
        {
          name: physicalName(64, `${name}Credentials`),
          permissions: { canPublish: true, canReceive: true },
        },
        { parent: this, dependsOn: [sqs], ignoreChanges: ["name"] },
      ),
    );
  }

  /**
   * The URL of the queue.
   */
  public get url() {
    return this.queue.url;
  }

  /**
   * The underlying resources this component creates.
   */
  public get nodes() {
    return {
      queue: this.queue,
      credentials: this.credentials,
    };
  }

  /** @internal */
  public getSSTLink(): LinkDefinition {
    return {
      properties: {
        url: this.queue.url,
        endpoint: this.sqs.endpoint,
        region: this.sqs.region,
        accessKey: this.credentials.accessKey,
        secretKey: this.credentials.secretKey,
      },
    };
  }
}
