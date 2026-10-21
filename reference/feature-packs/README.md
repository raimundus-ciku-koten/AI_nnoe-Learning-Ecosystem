# Feature package snapshots

These folders preserve earlier, self-contained student and barcode feature
packages for reference during migration:

- `barcode-kit/`
- `paket-siswa/`

They are intentionally outside `web/src/`. The active frontend and its test
suite use the maintained modules under `web/src/pages/dataDasar/` and
`web/tests/`. The Firebase configuration, rules, and tests inside these
snapshots are package-specific reference copies; do not use them as the root
project's deployment configuration.
