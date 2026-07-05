import { Resource } from "sst";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R = Resource as Record<string, any>;

// Invoked by the queue trigger — the SQS message body arrives as the request
// body. Writes each consumed message into the bucket so the HTTP handler can
// list them (proving trigger consumption AND S3 access with the injected IAM
// credentials).
export async function handler(event: any) {
  const body =
    typeof event?.body === "string"
      ? event.body
      : JSON.stringify(event?.body ?? {});

  let source = "unknown";
  try {
    source = JSON.parse(body).source ?? "unknown";
  } catch {}

  const s3 = new S3Client({
    region: R.MyBucket.region,
    endpoint: `https://s3.${R.MyBucket.region}.scw.cloud`,
    credentials: {
      accessKeyId: process.env.SST_SCALEWAY_ACCESS_KEY!,
      secretAccessKey: process.env.SST_SCALEWAY_SECRET_KEY!,
    },
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: R.MyBucket.name,
      Key: `messages/${Date.now()}-${source}.json`,
      Body: body,
      ContentType: "application/json",
    }),
  );

  return { statusCode: 200, body: "consumed" };
}
