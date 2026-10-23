# Third-party notices

Proofdesk's own source code is licensed under the Apache License 2.0 (see
[`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)). That grant does **not** cover the
third-party material below, which keeps the license of its authors.

## Bundled in this repository: `backend/assets/ila-toolchain/`

This directory is the build toolchain for the *Interactive Linear Algebra*
textbook (Georgia Tech), copied into the repository so the local demo can run
without network access. **None of it is covered by Proofdesk's Apache-2.0 grant.**

### Components that state their license

| Component | Where | License |
|---|---|---|
| MathBox, ShaderGraph, Threestrap (Steven Wittens and contributors) | `mathbox/`, `mathbox/vendor/shadergraph/`, `mathbox/vendor/threestrap/` | MIT (`LICENSE.md` in each) |
| three.js r71 | `mathbox/vendor/three.min.js` | MIT (see threejs.org/license) |
| Bootstrap 3.1.1 | `demos/vendor/bootstrap*` | MIT (stated in the file header) |
| dat.gui (Google Data Arts Team) | `demos/vendor/dat.gui*` | Apache-2.0 (stated in the file header) |
| plotly.js 1.32.0 | `demos/vendor/plotly.js` | MIT (stated in the file header) |
| screenfull 5.0.0 | `demos/vendor/screenfull.js` | MIT (stated in the file header) |

### Material whose license is not stated in this repository

These files carry no license text here. Their upstream licenses should be
confirmed before anyone relies on them being reusable.

- **ILA textbook tooling**: the `demos/*.mako` pages, `demos/SConscript`,
  `demos/css/`, `static/css/`, and `static/js/Mathbook.js` ("GT Mathbook",
  rewritten by Joseph Rabinoff from work by Michael DuBois, David Farmer and
  Rob Beezer).
- **Georgia Tech and Duke University logos and icons**: `static/theme-gt/`,
  `static/theme-duke/`. These are institutional marks, not open-source assets.
- **Charter BT fonts**: `static/fonts/CharterBT-*`.
- **Small libraries without a header here**: KaTeX 0.11.1 (`demos/vendor/katex*`,
  MIT upstream), expr-eval (`demos/vendor/expreval*`, MIT upstream), domready
  (`demos/vendor/domready*`), and two helper scripts by J. Rabinoff
  (`demos/vendor/roots.js`, `demos/vendor/compat.js`).

## npm dependencies

Installed from the npm registry, not copied into this repository. A scan of the
production dependencies of the root, `frontend/` and `backend/` packages found
only permissive licenses (MIT, ISC, BSD, Apache-2.0, BlueOak-1.0.0, 0BSD,
Unlicense, MIT-0), plus one weak-copyleft package:

- `elkjs` (EPL-2.0), used unmodified as a dependency.

Re-run the scan after changing dependencies:

```bash
npx license-checker-rseidelsohn --production --summary   # in the root, frontend/ and backend/
```

## Loaded at runtime, not distributed here

The editor loads Pyodide (MPL-2.0), KaTeX (MIT) and Tailwind's CDN build (MIT)
from public CDNs in the browser. They are not part of this repository.

## Docker builder image

`docker/Dockerfile` installs TeX Live, Python libraries and other programs from
their distributors when the image is built. They run as separate programs, are
not part of this repository's source, and keep their own licenses.
