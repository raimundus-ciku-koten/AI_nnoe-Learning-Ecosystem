import hmac
import os
import secrets
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path


MAX_REQUEST_BYTES = 10 * 1024 * 1024
SOFFICE_TIMEOUT_SECONDS = 45
QPDF_TIMEOUT_SECONDS = 15
REQUEST_TIMEOUT_SECONDS = 60
DOC_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")
DOCX_SIGNATURE = b"PK\x03\x04"


class ConversionError(Exception):
    pass


def document_extension(document):
    if document.startswith(DOC_SIGNATURE):
        return ".doc"
    if document.startswith(DOCX_SIGNATURE):
        return ".docx"
    raise ConversionError("Unsupported Word document")


def convert_document(document):
    extension = document_extension(document)
    with tempfile.TemporaryDirectory(prefix="word-conversion-") as directory:
        work_dir = Path(directory)
        input_path = work_dir / ("input" + extension)
        pdf_path = work_dir / "input.pdf"
        restricted_pdf_path = work_dir / "restricted.pdf"
        profile_path = work_dir / "lo-profile"
        input_path.write_bytes(document)

        try:
            subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--nologo",
                    "--nodefault",
                    "--nolockcheck",
                    "-env:UserInstallation=" + profile_path.as_uri(),
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(work_dir),
                    str(input_path),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=SOFFICE_TIMEOUT_SECONDS,
            )
            if not pdf_path.is_file() or pdf_path.stat().st_size == 0:
                raise ConversionError("Conversion failed")

            owner_password = secrets.token_urlsafe(32)
            subprocess.run(
                [
                    "qpdf",
                    "--encrypt",
                    "",
                    owner_password,
                    "256",
                    "--print=none",
                    "--modify=none",
                    "--extract=n",
                    "--accessibility=n",
                    "--",
                    str(pdf_path),
                    str(restricted_pdf_path),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=QPDF_TIMEOUT_SECONDS,
            )
            if not restricted_pdf_path.is_file() or restricted_pdf_path.stat().st_size == 0:
                raise ConversionError("PDF restriction failed")
            return restricted_pdf_path.read_bytes()
        except (OSError, subprocess.SubprocessError) as error:
            raise ConversionError("Conversion failed") from error


def make_handler(bearer_token):
    if not bearer_token:
        raise ValueError("A bearer token is required")

    class ConversionHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            super().setup()
            self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)

        def log_message(self, format_string, *args):
            return

        def _reply(self, status):
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self):
            if self.path != "/convert":
                self._reply(404)
                return

            authorization = self.headers.get("Authorization", "")
            prefix = "Bearer "
            supplied_token = authorization[len(prefix):] if authorization.startswith(prefix) else ""
            if not hmac.compare_digest(supplied_token, bearer_token):
                self._reply(401)
                return

            if self.headers.get("Transfer-Encoding"):
                self._reply(501)
                return

            content_length = self.headers.get("Content-Length")
            if content_length is None:
                self._reply(411)
                return
            try:
                request_size = int(content_length)
            except ValueError:
                self._reply(400)
                return
            if request_size < 0:
                self._reply(400)
                return
            if request_size > MAX_REQUEST_BYTES:
                self._reply(413)
                return

            document = self.rfile.read(request_size)
            if len(document) != request_size:
                self._reply(400)
                return

            try:
                pdf = convert_document(document)
            except ConversionError:
                self._reply(422)
                return

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(pdf)))
            self.end_headers()
            self.wfile.write(pdf)

    return ConversionHandler


def main():
    token = os.environ.get("CONVERSION_BEARER_TOKEN", "")
    handler = make_handler(token)
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), handler).serve_forever()


if __name__ == "__main__":
    main()
