# Third-Party Notices

This package contains code derived from third-party open-source software.

## SST (https://github.com/anomalyco/sst)

Portions of `src/internal/` (the physical-naming scheme in `naming.ts`, the
`transform` helper, and the shape of the linking definitions) are ported from
SST's platform source (`platform/src/components/`), used under the MIT
License:

```
MIT License

Copyright (c) 2024 SST

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dependencies

This package depends on, but does not redistribute code from,
`@pulumiverse/scaleway` (Apache-2.0, community-maintained by Pulumiverse) and
`@pulumi/pulumi` (Apache-2.0).
