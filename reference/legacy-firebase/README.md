# Alternative Firebase bootstrap snapshots

The files in this folder are preserved alternatives that were not imported by
the active application. The active Firebase app is initialized in
`web/src/firebase/core/`; shared clients are exposed from
`web/src/firebase/index.js`.

Do not import or deploy these snapshots without first reconciling their
configuration, emulator, persistence, and App Check behavior with the active
Firebase client.
