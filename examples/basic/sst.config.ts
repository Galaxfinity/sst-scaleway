/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "sst-scaleway-basic",
      removal: "remove",
      home: "local",
      providers: {
        scaleway: "1.51.1",
        "@galaxfinity/sst-scaleway": "0.2.0",
      },
    };
  },
  async run() {
    // `scw` is a typed global injected by `sst add @galaxfinity/sst-scaleway`
    // - no import needed, same as the `aws.*` / `scaleway.*` provider globals.
    const bucket = new scw.Bucket("MyBucket");
    const db = new scw.Postgres("MyDatabase");
    const queue = new scw.Queue("MyQueue");

    // Consume queue messages with a private function; it writes each message
    // into the bucket.
    queue.subscribe("src/consumer.handler", { link: [bucket] });

    const fn = new scw.Function("MyFunction", {
      handler: "src/index.handler",
      link: [bucket, db, queue],
    });

    // Invoke the function hourly with a marker payload.
    new scw.Cron("MyCron", {
      function: fn,
      schedule: "0 * * * *",
      event: { source: "cron" },
    });

    return {
      url: fn.url,
      bucket: bucket.name,
      database: db.database,
      queue: queue.url,
    };
  },
});
