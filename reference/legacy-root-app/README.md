# Legacy root-level application snapshot

The JavaScript modules in this folder were previously stored at the workspace
root. They are not imported by the active Vite app, whose entry point is
`web/src/main.jsx`. They are kept intact for reference; make new changes in
`web/src/` and do not deploy this snapshot.

The archived `set-role.mjs` is also retained here. The maintained root command
uses `scripts/setRole.js`.
