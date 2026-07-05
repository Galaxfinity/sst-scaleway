import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  ComponentResourceOptions,
  Input,
  Output,
  all,
  interpolate,
  output,
} from "@pulumi/pulumi";
// Imported as `scwSdk`: SST's bundler injects `import * as <alias> from ...`
// for every registered provider into every bundled file, so this identifier
// must collide neither with "scaleway" nor with our own "scw" alias.
import * as scwSdk from "@pulumiverse/scaleway";
import { Component, Transform, transform } from "../internal/component.js";
import { LinkDefinition, getInclude, linkEnvironment } from "../internal/link.js";
import { physicalName, prefixName } from "../internal/naming.js";
import type { Permission } from "../permission.js";

export interface FunctionArgs {
  /**
   * Path to the handler, relative to the project root: `"path/to/file.export"`.
   * The file extension is resolved automatically (.ts, .js, .mts, .mjs, ...).
   *
   * @example
   * ```ts
   * { handler: "src/index.handler" }
   * ```
   */
  handler: Input<string>;
  /**
   * The Scaleway function runtime.
   * @default `"node22"`
   */
  runtime?: Input<string>;
  /**
   * Memory limit in MB.
   * @default `256`
   */
  memory?: Input<number>;
  /**
   * Timeout in seconds.
   * @default `30`
   */
  timeout?: Input<number>;
  /**
   * Whether the function gets a public HTTPS endpoint. Set to `false` for
   * `private` privacy (token-authenticated).
   * @default `true`
   */
  url?: Input<boolean>;
  /**
   * Minimum number of instances. Keep at `0` for scale-to-zero.
   * @default `0`
   */
  minScale?: Input<number>;
  /**
   * Maximum number of instances.
   * @default `20`
   */
  maxScale?: Input<number>;
  /**
   * Environment variables available at runtime.
   */
  environment?: Input<Record<string, Input<string>>>;
  /**
   * Link resources to this function. Linked resources are available at
   * runtime through the `Resource` object of the `sst` SDK, and their
   * `scaleway.permission` includes are granted via a dedicated IAM
   * application + API key injected as `SCW_*` env vars.
   */
  link?: Input<any[]>;
  /**
   * ID of an existing Functions namespace to deploy into. By default all
   * functions of the app/stage share one namespace created by this package.
   */
  namespace?: Input<string>;
  /**
   * Transform how this component creates its underlying resources.
   */
  transform?: {
    function?: Transform<scwSdk.functions.FunctionArgs>;
    namespace?: Transform<scwSdk.functions.NamespaceArgs>;
  };
}

// All Functions in a stack share one namespace per app/stage, mirroring how
// SST shares per-region infrastructure. Module state is safe here: the config
// is evaluated in a fresh process per deploy.
let defaultNamespace: scwSdk.functions.Namespace | undefined;
function getDefaultNamespace(
  transformNamespace?: Transform<scwSdk.functions.NamespaceArgs>,
) {
  if (!defaultNamespace) {
    defaultNamespace = new scwSdk.functions.Namespace(
      ...transform(transformNamespace, "SstScalewayFunctionNamespace", {
        name: prefixName(63, "fn").toLowerCase(),
      }, {}),
    );
  }
  return defaultNamespace;
}

/**
 * The `Function` component creates a Scaleway Serverless Function with
 * Lambda-style ergonomics: point it at a TypeScript handler and it bundles
 * the code with esbuild, zips it, and wires up linking.
 *
 * @example
 * ```ts title="sst.config.ts"
 * new Function("MyFunction", {
 *   handler: "src/index.handler",
 *   link: [bucket],
 * });
 * ```
 */
export class Function extends Component {
  private fn: scwSdk.functions.Function;

  constructor(name: string, args: FunctionArgs, opts?: ComponentResourceOptions) {
    super("sst-scaleway:index:Function", name, args, opts);

    const parent = this;

    const namespaceId =
      args.namespace ?? getDefaultNamespace(args.transform?.namespace).id;

    const build = buildHandler();
    const credentials = createCredentials();
    const fn = createFunction();
    this.fn = fn;

    /**
     * Bundle the handler with esbuild and zip it. esbuild and archiver are
     * imported dynamically: SST's bundler leaves them external and at runtime
     * they resolve from `.sst/platform/node_modules`, which vendors both.
     */
    function buildHandler() {
      return all([args.handler, args.runtime]).apply(
        async ([handler, runtime]) => {
          const pos = handler.lastIndexOf(".");
          if (pos < 0) {
            throw new Error(
              `Invalid handler "${handler}". Expected the format "path/to/file.export", e.g. "src/index.handler".`,
            );
          }
          const fileBase = handler.slice(0, pos);
          const exportName = handler.slice(pos + 1);

          const root = $cli.paths.root;
          const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
          const entry = extensions
            .map((ext) => path.join(root, fileBase + ext))
            .find((p) => fs.existsSync(p));
          if (!entry) {
            throw new Error(
              `Could not find handler file for "${handler}" (looked for ${fileBase}{${extensions.join(",")}} relative to ${root}).`,
            );
          }

          const outDir = path.join(root, ".sst-scaleway", "artifacts", name);
          fs.mkdirSync(outDir, { recursive: true });
          const outfile = path.join(outDir, "handler.js");

          const esbuild = await import("esbuild");
          await esbuild.build({
            entryPoints: [entry],
            outfile,
            bundle: true,
            platform: "node",
            // Scaleway's Node runtime has `"type": "module"` in /home/app, so
            // .js files are ESM. The banner shims require/__dirname for CJS
            // dependencies inside the bundle (same trick SST's CLI uses).
            format: "esm",
            banner: {
              js: [
                `import { createRequire as topLevelCreateRequire } from "module";`,
                `const require = topLevelCreateRequire(import.meta.url);`,
                `import { fileURLToPath as topLevelFileUrlToPath, URL as topLevelURL } from "url";`,
                `const __filename = topLevelFileUrlToPath(import.meta.url);`,
                `const __dirname = topLevelFileUrlToPath(new topLevelURL(".", import.meta.url));`,
              ].join("\n"),
            },
            target: runtime ?? "node22",
            logLevel: "silent",
          });

          const zipPath = path.join(outDir, "code.zip");
          const archiver = (await import("archiver")).default;
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createWriteStream(zipPath);
            const archive = archiver("zip");
            stream.on("close", () => resolve());
            archive.on("error", reject);
            archive.pipe(stream);
            archive.file(outfile, { name: "handler.js" });
            archive.finalize();
          });

          // Hash the bundle (not the zip - zip bytes vary with timestamps) so
          // the function only redeploys when the code actually changes.
          const hash = crypto
            .createHash("sha256")
            .update(fs.readFileSync(outfile))
            .digest("hex");

          return { zipPath, hash, handler: `handler.${exportName}` };
        },
      );
    }

    /**
     * Provision IAM credentials for the `scaleway.permission` includes of the
     * linked resources - same pattern as SST's cloudflare.Worker consuming
     * `aws.permission` includes.
     */
    function createCredentials() {
      return getInclude<Permission>("scaleway.permission", args.link).apply(
        (permissions) => {
          if (permissions.length === 0) return undefined;

          // IAM applications and policies are organization-scoped, but most
          // setups only configure project/region. Derive the organization
          // from the project instead of requiring another env var.
          const organizationId = scwSdk.account.getProjectOutput({
            projectId: defaultProjectId(),
          }).organizationId;

          const application = new scwSdk.iam.Application(
            `${name}Application`,
            {
              name: physicalName(64, `${name}Application`),
              organizationId,
            },
            { parent, ignoreChanges: ["name"] },
          );

          new scwSdk.iam.Policy(
            `${name}Policy`,
            {
              name: physicalName(64, `${name}Policy`),
              applicationId: application.id,
              organizationId,
              rules: permissions.map((p) => ({
                permissionSetNames: p.permissionSetNames as unknown as string[],
                projectIds: (p.projectIds ??
                  (p.organizationId
                    ? undefined
                    : [defaultProjectId()])) as unknown as string[],
                organizationId: p.organizationId as unknown as string,
              })),
            },
            { parent, ignoreChanges: ["name"] },
          );

          return new scwSdk.iam.ApiKey(
            `${name}ApiKey`,
            {
              applicationId: application.id,
              description: `${$app.name}/${$app.stage} ${name} (sst-scaleway)`,
              // Keys must expire within 1 year (org security settings can
              // enforce this). Pinning the expiry to fixed half-year
              // boundaries means the value only changes twice a year — and
              // since expiresAt forces replacement, that change rotates the
              // key automatically (new key created before the old one is
              // deleted). Keys stay valid 6-12 months ahead as long as the
              // app is deployed at least once per half-year.
              expiresAt: apiKeyExpiresAt(),
            },
            { parent },
          );
        },
      );
    }

    function apiKeyExpiresAt() {
      const now = new Date();
      return now.getUTCMonth() < 6
        ? `${now.getUTCFullYear()}-12-31T00:00:00Z`
        : `${now.getUTCFullYear() + 1}-06-30T00:00:00Z`;
    }

    function defaultProjectId() {
      const projectId =
        scwSdk.config.projectId ?? process.env.SCW_DEFAULT_PROJECT_ID;
      if (!projectId) {
        throw new Error(
          `Linking a resource with Scaleway permissions requires a project scope. Configure the provider's project (e.g. SCW_DEFAULT_PROJECT_ID) or pass "projectIds" to permission().`,
        );
      }
      return projectId;
    }

    function createFunction() {
      return new scwSdk.functions.Function(
        ...transform(
          args.transform?.function,
          `${name}Function`,
          {
            namespaceId,
            // Scaleway limits function names to 34 chars (provider-validated).
            name: physicalName(34, name).toLowerCase(),
            runtime: args.runtime ?? "node22",
            handler: build.handler,
            zipFile: build.zipPath,
            zipHash: build.hash,
            privacy: output(args.url).apply((url) =>
              url === false ? "private" : "public",
            ),
            memoryLimit: args.memory ?? 256,
            timeout: args.timeout ?? 30,
            minScale: args.minScale ?? 0,
            maxScale: args.maxScale ?? 20,
            deploy: true,
            environmentVariables: output(args.environment).apply(
              (environment) => ({ ...environment }),
            ),
            // Link payloads can carry secrets (queue credentials, connection
            // info), so they go into secret env vars. The SCW_* prefix is
            // reserved by Scaleway, hence SST_SCALEWAY_*. The application ID
            // is injected because Serverless SQL Databases authenticate with
            // it as the username (secret key as password).
            secretEnvironmentVariables: all([
              linkEnvironment(args.link),
              credentials,
            ]).apply(([linkEnv, key]) => ({
              ...linkEnv,
              ...(key
                ? {
                    SST_SCALEWAY_ACCESS_KEY: key.accessKey,
                    SST_SCALEWAY_SECRET_KEY: key.secretKey,
                    SST_SCALEWAY_APPLICATION_ID: key.applicationId,
                  }
                : {}),
            })) as Output<Record<string, never>> as never,
          },
          { parent, ignoreChanges: ["name"] },
        ),
      );
    }
  }

  /**
   * The HTTPS endpoint of the function.
   */
  public get url() {
    return interpolate`https://${this.fn.domainName}`;
  }

  /**
   * The generated name of the function.
   */
  public get name() {
    return this.fn.name;
  }

  /**
   * The underlying resources this component creates.
   */
  public get nodes() {
    return {
      function: this.fn,
    };
  }

  /** @internal */
  public getSSTLink(): LinkDefinition {
    return {
      properties: {
        name: this.name,
        url: this.url,
      },
    };
  }
}
