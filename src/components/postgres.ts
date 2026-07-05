import { ComponentResourceOptions, output } from "@pulumi/pulumi";
// Imported as `scwSdk`: SST's bundler injects `import * as <alias> from ...`
// for every registered provider into every bundled file, so this identifier
// must collide neither with "scaleway" nor with our own "scw" alias.
import * as scwSdk from "@pulumiverse/scaleway";
import { Component, Transform, transform } from "../internal/component.js";
import { LinkDefinition } from "../internal/link.js";
import { physicalName } from "../internal/naming.js";
import { permission } from "../permission.js";

export interface PostgresArgs {
  /**
   * Minimum number of CPU units. Keep at `0` for scale-to-zero.
   * @default `0`
   */
  minCpu?: number;
  /**
   * Maximum number of CPU units.
   * @default `4`
   */
  maxCpu?: number;
  /**
   * Transform how this component creates its underlying resources.
   */
  transform?: {
    /**
     * Transform the Serverless SQL Database resource.
     */
    database?: Transform<scwSdk.databases.ServerlessDatabaseArgs>;
  };
}

/**
 * The `Postgres` component creates a Scaleway Serverless SQL Database -
 * a scale-to-zero PostgreSQL database.
 *
 * Authentication uses Scaleway IAM: connect with the IAM application ID as
 * the username and the API secret key as the password. A linked `Function`
 * gets both injected automatically (`SST_SCALEWAY_APPLICATION_ID`,
 * `SST_SCALEWAY_SECRET_KEY`) along with host/port/database via the link.
 *
 * @example
 * ```ts title="sst.config.ts"
 * const db = new Postgres("MyDatabase");
 *
 * new Function("MyApi", {
 *   handler: "src/index.handler",
 *   link: [db],
 * });
 * ```
 *
 * ```ts title="src/index.ts"
 * import { Resource } from "sst";
 * import postgres from "postgres";
 *
 * const sql = postgres({
 *   host: Resource.MyDatabase.host,
 *   port: Resource.MyDatabase.port,
 *   database: Resource.MyDatabase.database,
 *   username: process.env.SST_SCALEWAY_APPLICATION_ID,
 *   password: process.env.SST_SCALEWAY_SECRET_KEY,
 *   ssl: "require",
 * });
 * ```
 */
export class Postgres extends Component {
  private db: scwSdk.databases.ServerlessDatabase;

  constructor(
    name: string,
    args: PostgresArgs = {},
    opts?: ComponentResourceOptions,
  ) {
    super("sst-scaleway:index:Postgres", name, args, opts);

    this.db = new scwSdk.databases.ServerlessDatabase(
      ...transform(
        args.transform?.database,
        `${name}Database`,
        {
          name: physicalName(63, name).toLowerCase(),
          minCpu: args.minCpu ?? 0,
          maxCpu: args.maxCpu ?? 4,
        },
        // Renaming recreates the database (data loss) - pin the generated
        // name after creation.
        { parent: this, ignoreChanges: ["name"] },
      ),
    );
  }

  /**
   * The name of the database.
   */
  public get database() {
    return this.db.name;
  }

  /**
   * The raw endpoint of the database (`postgres://host:port`).
   */
  public get endpoint() {
    return this.db.endpoint;
  }

  /**
   * The database host.
   */
  public get host() {
    return this.db.endpoint.apply((e) => new URL(e).hostname);
  }

  /**
   * The database port.
   */
  public get port() {
    return this.db.endpoint.apply((e) =>
      parseInt(new URL(e).port || "5432", 10),
    );
  }

  /**
   * The underlying resources this component creates.
   */
  public get nodes() {
    return {
      database: this.db,
    };
  }

  /** @internal */
  public getSSTLink(): LinkDefinition {
    return {
      properties: {
        endpoint: this.endpoint,
        host: this.host,
        port: this.port,
        database: this.db.name,
      },
      include: [
        permission({
          permissionSetNames: ["ServerlessSQLDatabaseReadWrite"],
        }),
      ],
    };
  }
}
