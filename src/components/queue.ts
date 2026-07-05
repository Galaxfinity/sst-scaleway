import { ComponentResourceOptions, Input, output } from "@pulumi/pulumi";
// Imported as `scwSdk`: SST's bundler injects `import * as <alias> from ...`
// for every registered provider into every bundled file, so this identifier
// must collide neither with "scaleway" nor with our own "scw" alias.
import * as scwSdk from "@pulumiverse/scaleway";
import { Component, Transform, transform } from "../internal/component.js";
import { LinkDefinition } from "../internal/link.js";
import { physicalName } from "../internal/naming.js";
import { Function, FunctionArgs } from "./function.js";

export interface QueueArgs {
  /**
   * Create a FIFO queue.
   * @default `false`
   */
  fifo?: Input<boolean>;
  /**
   * Whether this app should activate MNQ SQS in the project. Activation is
   * project-level and can only exist once — set this to `false` when SQS is
   * already activated outside this app (another SST app, Terraform, or the
   * console). The first `Queue` of a stack decides; later ones share it.
   * @default `true`
   */
  activateSqs?: boolean;
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

export type QueueSubscriberArgs = Omit<FunctionArgs, "handler">;

interface SqsInfo {
  endpoint: Input<string>;
  region: Input<string>;
  projectId: Input<string> | undefined;
  activation?: scwSdk.mnq.Sqs;
  manage: scwSdk.mnq.SqsCredentials;
}

// MNQ SQS is activated once per project, and queue management needs its own
// SQS credentials - both shared across all Queues of the stack.
let sqsInfo: SqsInfo | undefined;
function getSqs(activate: boolean): SqsInfo {
  if (sqsInfo) return sqsInfo;

  const activation = activate
    ? new scwSdk.mnq.Sqs("SstScalewaySqs", {})
    : undefined;
  const region =
    scwSdk.config.region ?? process.env.SCW_DEFAULT_REGION ?? "fr-par";
  const projectId =
    scwSdk.config.projectId ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const manage = new scwSdk.mnq.SqsCredentials(
    "SstScalewaySqsManageCredentials",
    {
      name: physicalName(64, "sqs-manage"),
      permissions: { canManage: true },
    },
    {
      dependsOn: activation ? [activation] : [],
      ignoreChanges: ["name"],
    },
  );
  const info: SqsInfo = {
    endpoint: activation?.endpoint ?? `https://sqs.mnq.${region}.scaleway.com`,
    region: activation
      ? activation.region.apply((r) => r ?? region)
      : region,
    projectId: activation?.projectId ?? projectId,
    activation,
    manage,
  };
  sqsInfo = info;
  return info;
}

/**
 * The `Queue` component creates a Scaleway MNQ queue (SQS-compatible).
 *
 * MNQ authenticates with its own credentials, not IAM - the link carries a
 * publish+receive credential pair, so any SQS client works at runtime. Use
 * `subscribe()` to consume messages with a function.
 *
 * @example
 * ```ts title="sst.config.ts"
 * const queue = new Queue("MyQueue");
 *
 * queue.subscribe("src/consumer.handler");
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
  private componentName: string;
  private queue: scwSdk.mnq.SqsQueue;
  private credentials: scwSdk.mnq.SqsCredentials;
  private info: SqsInfo;

  constructor(name: string, args: QueueArgs = {}, opts?: ComponentResourceOptions) {
    super("sst-scaleway:index:Queue", name, args, opts);

    this.componentName = name;
    this.info = getSqs(args.activateSqs ?? true);

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
          accessKey: this.info.manage.accessKey,
          secretKey: this.info.manage.secretKey,
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
        {
          parent: this,
          dependsOn: this.info.activation ? [this.info.activation] : [],
          ignoreChanges: ["name"],
        },
      ),
    );
  }

  /**
   * Subscribe a function to this queue. Messages are consumed by a
   * `functions.Trigger` and invoke the function with the message body as the
   * request body.
   *
   * @param subscriber A handler path (`"src/consumer.handler"`) to create a
   * private function from, or an existing `Function` component.
   * @param args Function args for the created subscriber (ignored when an
   * existing `Function` is passed).
   *
   * @example
   * ```ts
   * queue.subscribe("src/consumer.handler", { link: [bucket] });
   * ```
   */
  public subscribe(
    subscriber: string | Function,
    args?: QueueSubscriberArgs,
  ): Function {
    const fn =
      typeof subscriber === "string"
        ? new Function(
            `${this.componentName}Subscriber`,
            { handler: subscriber, url: false, ...args },
            { parent: this },
          )
        : subscriber;

    new scwSdk.functions.Trigger(
      `${this.componentName}Trigger`,
      {
        functionId: fn.nodes.function.id,
        sqs: {
          queue: this.queue.name,
          projectId: this.info.projectId as Input<string>,
          region: this.info.region,
        },
      },
      { parent: this },
    );

    return fn;
  }

  /**
   * The URL of the queue.
   */
  public get url() {
    return this.queue.url;
  }

  /**
   * The name of the queue.
   */
  public get name() {
    return this.queue.name;
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
        endpoint: this.info.endpoint,
        region: this.info.region,
        accessKey: this.credentials.accessKey,
        secretKey: this.credentials.secretKey,
      },
    };
  }
}
