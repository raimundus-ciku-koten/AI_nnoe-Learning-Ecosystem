# Feature package snapshots

These folders preserve earlier, self-contained student and barcode utilities
for reference during migration:

- `barcode-kit/`
- `paket-siswa/`

They are intentionally outside `web/src/`. The active frontend and its test
suite use the maintained modules under `web/src/pages/dataDasar/` and
`web/tests/`. Cloud database adapters, deployment configuration, and security
rules have been removed from these snapshots; remaining utilities are not
deployable integrations.
