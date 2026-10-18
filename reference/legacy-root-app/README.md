# Legacy root-level application snapshot

The JavaScript modules in this folder were previously stored at the workspace
root. They are not imported by the active Vite app, whose entry point is
`web/src/main.jsx`. They are kept intact for reference; make new changes in
`web/src/` and do not deploy this snapshot.

The archived `set-role.mjs` is retained only as a historical Firebase
administration snapshot. It is not wired to a root command and must not be used
for the active Supabase application.
