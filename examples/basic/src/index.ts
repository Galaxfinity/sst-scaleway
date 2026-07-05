import { Resource } from "sst";
import postgres from "postgres";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const R = Resource as Record<string, any>;

export async function handler(event: unknown) {
  // Postgres: authenticate with the function's own IAM credentials.
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

  // Queue: MNQ is SQS-compatible, credentials come from the link.
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
      MessageBody: JSON.stringify({ dbTime: row.now }),
    }),
  );

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Hello from Scaleway via sst-scaleway!",
      linkedBucket: R.MyBucket.name,
      dbTime: row.now,
      queuedMessageId: sent.MessageId,
    }),
  };
}
