import { ComponentResourceOptions, Input, output } from "@pulumi/pulumi";
// Imported as `scwSdk`: SST's bundler injects `import * as <alias> from ...`
// for every registered provider into every bundled file, so this identifier
// must collide neither with "scaleway" nor with our own "scw" alias.
import * as scwSdk from "@pulumiverse/scaleway";
import { Component, Transform, transform } from "../internal/component.js";
import { Function } from "./function.js";

export interface CronArgs {
  /**
   * The function to invoke - a `Function` component or a function ID.
   */
  function: Input<Function | string>;
  /**
   * The schedule as a UNIX cron expression (UTC), e.g. `"0 3 * * *"`.
   */
  schedule: Input<string>;
  /**
   * Optional JSON payload passed to the function on each invocation.
   */
  event?: Input<Record<string, any>>;
  /**
   * Transform how this component creates its underlying resources.
   */
  transform?: {
    cron?: Transform<scwSdk.functions.CronArgs>;
  };
}

/**
 * The `Cron` component invokes a `Function` on a schedule.
 *
 * @example
 * ```ts title="sst.config.ts"
 * const fn = new Function("MyJob", { handler: "src/job.handler" });
 *
 * new Cron("MyCron", {
 *   function: fn,
 *   schedule: "0 3 * * *",
 * });
 * ```
 */
export class Cron extends Component {
  private cron: scwSdk.functions.Cron;

  constructor(name: string, args: CronArgs, opts?: ComponentResourceOptions) {
    super("sst-scaleway:index:Cron", name, args, opts);

    const functionId = output(args.function).apply((fn) =>
      typeof fn === "string" ? output(fn) : fn.nodes.function.id,
    );

    this.cron = new scwSdk.functions.Cron(
      ...transform(
        args.transform?.cron,
        `${name}Cron`,
        {
          functionId,
          schedule: args.schedule,
          ...(args.event
            ? { args: output(args.event).apply((e) => JSON.stringify(e)) }
            : {}),
        } as scwSdk.functions.CronArgs,
        { parent: this },
      ),
    );
  }

  /**
   * The underlying resources this component creates.
   */
  public get nodes() {
    return {
      cron: this.cron,
    };
  }
}
