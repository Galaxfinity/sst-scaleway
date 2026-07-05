/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "sst-scaleway-basic",
      removal: "remove",
      home: "local",
      providers: {
        scaleway: "1.51.1",
        "@galaxfinity/sst-scaleway": "0.0.1",
      },
    };
  },
  async run() {
    // `scw` is a typed global injected by `sst add @galaxfinity/sst-scaleway`
    // — no import needed, same as the `aws.*` / `scaleway.*` provider globals.
    const bucket = new scw.Bucket("MyBucket");

    const fn = new scw.Function("MyFunction", {
      handler: "src/index.handler",
      link: [bucket],
    });

    return {
      url: fn.url,
      bucket: bucket.name,
    };
  },
});
