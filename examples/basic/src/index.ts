import { Resource } from "sst";
import postgres from "postgres";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const R = Resource as Record<string, any>;

export async function handler(event: any) {
  // ?list=1 — show what the queue subscriber has written to the bucket.
  if (event?.queryStringParameters?.list) {
    const s3 = new S3Client({
      region: R.MyBucket.region,
      endpoint: `https://s3.${R.MyBucket.region}.scw.cloud`,
      credentials: {
        accessKeyId: process.env.SST_SCALEWAY_ACCESS_KEY!,
        secretAccessKey: process.env.SST_SCALEWAY_SECRET_KEY!,
      },
    });
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: R.MyBucket.name, Prefix: "messages/" }),
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).sort().slice(-20);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: listed.KeyCount ?? 0, latest: keys }),
    };
  }

  // Default action: query the database and enqueue a message. Cron
  // invocations carry {source: "cron"} as the request body.
  let source = "http";
  try {
    source = JSON.parse(event?.body ?? "{}").source ?? "http";
  } catch {}

  const sql = postgres({
    host: R.MyDatabase.host,
    port: R.MyDatabase.port,
    database: R.MyDatabase.database,
    username: process.env.SST_SCALEWAY_APPLICATION_ID,
    password: process.env.SST_SCALEWAY_SECRET_KEY,
    ssl: "require",
    max: 1,
  });
  const [row] = await sql`select now() as now`;
  await sql.end();

  const sqs = new SQSClient({
    region: R.MyQueue.region,
    endpoint: R.MyQueue.endpoint,
    credentials: {
      accessKeyId: R.MyQueue.accessKey,
      secretAccessKey: R.MyQueue.secretKey,
    },
  });
  const sent = await sqs.send(
    new SendMessageCommand({
      QueueUrl: R.MyQueue.url,
      MessageBody: JSON.stringify({ source, dbTime: row.now }),
    }),
  );

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Hello from Scaleway via sst-scaleway!",
      source,
      linkedBucket: R.MyBucket.name,
      dbTime: row.now,
      queuedMessageId: sent.MessageId,
    }),
  };
}
