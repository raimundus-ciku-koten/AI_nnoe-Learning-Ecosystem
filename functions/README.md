# Firebase Cloud Functions

## Superadmin account provisioning

The `createPlatformUser` callable creates accounts for `admin_sekolah`,
`operator`, `guru`, `siswa`, and `ortu` roles in an existing tenant. It requires
a superadmin custom claim and valid App Check, verifies the tenant, assigns
role/tenant custom claims, writes the user profile and directory entry, and
records an immutable `platform.user.created` audit event. The callable never
accepts or returns a password; the platform UI sends a Firebase Auth password
reset email so the new user sets their own password. If the email cannot be
sent, the account remains created and the user can use “Lupa sandi” on the
login page.

Creating an account does not grant a teacher class assignment or link a parent
account to a student. Those relationships require their respective school
workflows and must not be inferred from account creation.

Cloud Functions deployment and invocation require billing to be enabled on the
Firebase project. Register and configure App Check before using the callable in
production.

## AI providers and Canva

### No-billing browser BYOK mode

The web client supports direct BYOK use of Gemini, DeepSeek, and Groq without
Cloud Functions. Each signed-in user enters their own provider key. The key
remains in browser memory for the current tab and is sent directly to the
provider; it is not sent to Firebase or synchronized across devices.
Per-workflow provider preferences are stored locally per Firebase UID. The
provider receives the prompts and conversation content. A browser key is
visible to the browser user and is not protected from malicious scripts
running on the same origin. Use provider-side key restrictions and limits.

Cerebras currently rejects browser-origin requests through CORS and Canva's
OAuth token exchange requires a backend, so neither is available in this
no-billing mode. Free API eligibility and quotas are controlled by providers
and may change.

### Server-side mode (requires billing)

`chatAsisten`, `generatePerangkat`, and `generateQuestionDraft` are callable
functions in `asia-southeast2`. They require Firebase Authentication and App
Check, apply per-user quotas, and keep provider keys on the server. RPE, Prota,
and Prosem remain local calculations. ATP, KKTP, Modul Ajar, ordinary question
drafts, and Asisten AI can use the provider selected in server-side account
settings when this backend is deployed.

Server-side personal keys are sent only to an authenticated, App Check-protected
callable and stored in Firestore as AES-256-GCM ciphertext. The document
`privateAiSettings/{uid}` is denied to all client SDK reads and writes. This
configuration is separate from browser BYOK. Generate an encryption keyring
and store it as a Firebase secret before deploying:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$key = [Convert]::ToBase64String($bytes)
$ring = @{ active = 'v1'; keys = @{ v1 = $key } } | ConvertTo-Json -Compress
Write-Output $ring
firebase functions:secrets:set AI_CREDENTIALS_KEYRING
```

Paste `$ring` only into the Firebase CLI prompt, never into chat, source,
frontend environment files, Firestore client documents, or logs. For key
rotation, retain prior key versions in the JSON keyring until every encrypted
record using them has been re-encrypted. Set platform defaults separately:

```powershell
firebase functions:secrets:set GEMINI_API_KEYS
firebase functions:secrets:set DEEPSEEK_API_KEY
firebase functions:secrets:set GROQ_API_KEY
firebase functions:secrets:set CEREBRAS_API_KEY
```

On Windows, set both optional provider secrets with interactive Firebase CLI
prompts (the script never reads or writes the key values itself):

```powershell
.\scripts\setupAiProviderSecrets.ps1 -ProjectId <firebase-project-id>
```

`GEMINI_API_KEYS` accepts comma-separated keys. Register and configure Firebase
App Check for the web app before enabling server-side calls in production.
Cloud Functions deployment/invocation and Secret Manager require billing to be
enabled on the Firebase project.

Groq and Cerebras use their OpenAI-compatible chat-completions APIs. In
server-side mode, configure shared keys as Firebase secrets above. The
no-billing browser mode only supports the providers that accept direct browser
requests. Defaults are `llama-3.3-70b-versatile` for Groq and `qwen-3.8-27b` for Cerebras.
Override these with `GROQ_MODEL` or `CEREBRAS_MODEL` if the provider retires or
changes model availability. Free access is subject to each provider's account
eligibility, rate limits, and current terms; it is not a guaranteed unlimited
or permanent free service. See the [Groq model catalogue](https://console.groq.com/docs/models),
[Groq rate limits](https://console.groq.com/docs/rate-limits), and
[Cerebras shared-inference model catalogue](https://inference-docs.cerebras.ai/models/overview).

Claude is intentionally not used by this version: the requested policy was to
wait until a verifiably free Claude API endpoint is available. Anthropic API
usage is not guaranteed free; no “free medium” Claude API model is configured.

Canva is connected per account with Canva Connect OAuth using PKCE. Register a
Canva Developer app with the `design:content:write` scope and set the exact
callback URL to
`https://asia-southeast2-<project-id>.cloudfunctions.net/canvaOAuthCallback`.
Set `CANVA_CLIENT_ID` and `CANVA_REDIRECT_URI` in the project-specific
`functions/.env.<project-id>` file (do not commit it); store the client secret
with `firebase functions:secrets:set CANVA_CLIENT_SECRET` and the encryption
keyring through Firebase Secret Manager. The callback stores
Canva access/refresh tokens encrypted in the private user document. The
question-bank Canva action creates a blank Canva document; automatically
populating a school's branded question design requires a Canva brand-template
ID and template fields, which are not configured in this repository.

For the local Functions Emulator, create `functions/.secret.local` with the
same local-only secret names. Keep it out of source control.

## Word attachment conversion

Chat `.doc`/`.docx` downloads are converted server-side to PDFs and returned
with standard PDF editing/copy/print restrictions. The restrictions are not
DRM: compatible viewers may enforce them, but they cannot absolutely prevent
conversion, screenshots, or reproduction. Deploy the separate LibreOffice +
qpdf service from `conversion/` to Cloud Run; set `WORD_CONVERTER_URL` to its
HTTPS service URL and set the same strong `WORD_CONVERTER_TOKEN` secret on
Cloud Run and Functions before deploying. If the converter is not configured,
Word downloads fail closed rather than returning the original Word file.

For example, build and deploy the conversion service after setting
`WORD_CONVERTER_TOKEN` with `firebase functions:secrets:set`:

```powershell
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/REPOSITORY/word-conversion ./conversion
gcloud run deploy word-conversion `
  --image REGION-docker.pkg.dev/PROJECT/REPOSITORY/word-conversion `
  --region REGION `
  --allow-unauthenticated `
  --set-secrets CONVERSION_BEARER_TOKEN=WORD_CONVERTER_TOKEN:latest
```

Add `WORD_CONVERTER_URL` (the deployed HTTPS service URL),
`CANVA_CLIENT_ID`, and `CANVA_REDIRECT_URI` to
`functions/.env.<project-id>`. Then deploy Functions and Firestore Rules:

```powershell
firebase deploy --only functions,firestore:rules
```

Firebase will request missing bound secrets during deployment. Do not deploy
the Canva functions until the Developer app's redirect URI exactly matches the
configured URL. Configure the same Word-converter secret value in Cloud Run
and Firebase Secret Manager; never place it in the web app.

For the Functions Emulator, create `functions/.secret.local` with the same
variable names and local-only test keys. That file is ignored by Git. Start the
Functions and Firestore emulators with `firebase emulators:start`.

## Automatic Midtrans checkout (Blaze only)

This section documents the optional server-verified checkout backend. It is not
deployed in the current Firebase Spark configuration. The live web app is not
connected to Midtrans; it only copies a manual payment request summary.
Payments and subscription activation must be handled and verified manually;
see the root README.

`buatPembayaranPaket` accepts official school packages from school admins and
individual student/teacher packages from the matching account role. All plan
prices come from `functions/shared/pricing.json`; the server recomputes totals
and ignores client-supplied prices. Monthly prices are one tenth of the annual
document price. A checkout reservation prevents overlapping purchases; renewals extend
the same plan after its current end date. School entitlement is written to the
tenant only after Midtrans verifies payment. Individual entitlement is written
to `userSubscriptions/{uid}` and is readable only by that user. The legacy
per-seat `buatPembayaran` endpoint is disabled for new checkout. Never place
the Midtrans Server Key in web environment files.

For sandbox testing, set the sandbox Server Key as a Functions secret and keep
`MIDTRANS_MODE` at its default `sandbox`:

```powershell
firebase functions:secrets:set MIDTRANS_SERVER_KEY
firebase deploy --only functions
```

Set `BILLING_PPN_RATE` to the configured decimal rate (`0.11` or `0.12`) for
the Functions deployment and set the same value in `web/.env.production` as
`VITE_BILLING_PPN_RATE`. Configure the Midtrans notification URL in the merchant
portal to
`https://asia-southeast2-<project-id>.cloudfunctions.net/midtransWebhook`.
Production requires a production Server Key and `MIDTRANS_MODE=production`;
do not switch modes until production credentials and the webhook URL are set.
DANA and Google Pay appear only when the merchant account and Midtrans enable
those payment channels. The application does not claim or force a channel that
the merchant has not activated.

## Google Workspace

The login button uses Google Identity only for accounts that already have a
matching `users/{uid}` profile and server-managed `role`/`tenantId` custom
claims; client-side Google login cannot create profiles or grant roles. The
Workspace settings page links the same email account and requests only
`drive.file`, `calendar.events.owned`, and `gmail.send`. Its access token is
kept in page memory and is not written to Firestore or browser storage.

Before enabling the integrations, enable Google Drive API, Google Calendar API,
and Gmail API in the Google Cloud project associated with Firebase; configure
the OAuth consent screen, authorized domains, and verification for the
requested scopes. Users must approve the requested access. Drive upload is
limited to files selected by that user (10 MB maximum), Calendar creates events
on the user's primary calendar, and Gmail sends only a test message to the
signed-in user's own address. API enablement, OAuth verification, and Firebase
provider/domain configuration must be completed in the project console; the
source code cannot activate those external project settings.

## Media on Spark without Cloud Functions

New chat attachments are stored in `chatAttachments/{chatId}/{fileId}` in
Realtime Database. Realtime Database Rules check chat membership for reads and
require the uploader's UID for create/delete. The client and Rules limit files
to 2 MiB; base64 representation adds roughly one third to the stored payload.
Profile photos use Firebase Storage client SDK directly; client compression
resizes/re-encodes to JPEG at no more than 256 × 256 and 128 KiB, and Storage
Rules reject larger uploads. Each chat member may optionally copy an attachment
to their own Google Drive after OAuth consent.

These media paths do not require deploying Cloud Functions. Legacy chat
attachments previously stored under Cloud Storage paths are not migrated
automatically. Firebase Storage must already be provisioned and available to
the project; Realtime Database download/storage quotas still apply on Spark.

Payment function unit tests:

```powershell
npm run test:billing
```

Realtime Database chat rules are configured by `database.rules.json`; the local
emulator uses port `9001` to avoid colliding with existing local Firebase
emulators. Run their tests with:

```powershell
npm run test:rtdb
```

Deploy the Firestore, Realtime Database, and Storage rules together with
`npm run deploy:rules`.
