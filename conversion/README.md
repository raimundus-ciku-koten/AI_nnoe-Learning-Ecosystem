# Word-to-PDF conversion service

This bounded Cloud Run service accepts Word document bytes from trusted callers,
converts them with LibreOffice, and encrypts the PDF with qpdf restrictions.
It requires `Authorization: Bearer <token>` matching the
`CONVERSION_BEARER_TOKEN` environment variable. Send a DOC or DOCX file as the
raw body of `POST /convert`; requests over 10 MiB are rejected. Successful
responses have `Content-Type: application/pdf`.

Cloud Run terminates HTTPS. Deploy this service with ingress restricted to the
trusted Firebase Cloud Functions path where possible, and store the bearer token
in Secret Manager rather than in source or a client. Set the same secret in the
calling function and as `CONVERSION_BEARER_TOKEN` for this service. The service
listens on the Cloud Run-provided `PORT` (8080 by default).

Build from the repository root with
`gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/REPOSITORY/word-conversion ./conversion`,
then deploy that image to Cloud Run with the token secret exposed as
`CONVERSION_BEARER_TOKEN`.

The PDF uses an empty user password and a random owner password, with printing,
modification, extraction/copying, and accessibility access disabled using
qpdf's supported permission flags. These are PDF viewer permissions, not DRM:
some software may ignore them, and they cannot prevent screenshots or other
means of reproducing displayed content.

Run focused tests with `python -m unittest discover -s conversion/tests`.
