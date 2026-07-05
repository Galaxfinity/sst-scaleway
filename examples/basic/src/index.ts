import { Resource } from "sst";

export async function handler(event: unknown) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Hello from Scaleway via sst-scaleway!",
      linkedBucket: (Resource as Record<string, any>).MyBucket.name,
    }),
  };
}
