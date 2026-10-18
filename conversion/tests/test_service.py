import tempfile
import socket
import threading
import unittest
from pathlib import Path
from unittest import mock

from conversion import service


class ConversionTests(unittest.TestCase):
    def setUp(self):
        self.temp_root = tempfile.TemporaryDirectory(prefix="conversion-test-")
        self.addCleanup(self.temp_root.cleanup)
        self.work_dir = Path(self.temp_root.name)
        self.patched_temp = mock.patch.object(
            service.tempfile, "TemporaryDirectory"
        )
        self.mock_temporary_directory = self.patched_temp.start()
        self.addCleanup(self.patched_temp.stop)
        self.mock_temporary_directory.return_value.__enter__.return_value = str(
            self.work_dir
        )
        self.mock_temporary_directory.return_value.__exit__.return_value = False

    def test_conversion_applies_restrictions_and_returns_pdf(self):
        def run(command, **kwargs):
            if command[0] == "soffice":
                (self.work_dir / "input.pdf").write_bytes(b"%PDF-converted")
            else:
                (self.work_dir / "restricted.pdf").write_bytes(b"%PDF-restricted")
            return mock.Mock(returncode=0)

        with mock.patch.object(service.subprocess, "run", side_effect=run) as mocked_run:
            result = service.convert_document(b"PK\x03\x04docx data")

        self.assertEqual(result, b"%PDF-restricted")
        self.assertEqual(mocked_run.call_count, 2)
        convert_call, restrict_call = mocked_run.call_args_list
        convert_command = convert_call.args[0]
        convert_options = convert_call.kwargs
        restrict_command = restrict_call.args[0]
        restrict_options = restrict_call.kwargs
        self.assertIn("input.docx", convert_command[-1])
        self.assertEqual(convert_options["timeout"], service.SOFFICE_TIMEOUT_SECONDS)
        self.assertEqual(restrict_command[1], "--encrypt")
        self.assertEqual(restrict_command[2], "")
        self.assertTrue(restrict_command[3])
        self.assertEqual(restrict_command[4], "256")
        self.assertIn("--print=none", restrict_command)
        self.assertIn("--modify=none", restrict_command)
        self.assertIn("--extract=n", restrict_command)
        self.assertIn("--accessibility=n", restrict_command)
        self.assertEqual(restrict_options["timeout"], service.QPDF_TIMEOUT_SECONDS)
        self.assertEqual(convert_options["stdout"], service.subprocess.PIPE)

    def test_subprocess_failure_is_sanitized(self):
        with mock.patch.object(
            service.subprocess,
            "run",
            side_effect=service.subprocess.TimeoutExpired("soffice", 1),
        ):
            with self.assertRaises(service.ConversionError):
                service.convert_document(service.DOC_SIGNATURE + b"doc")

    def test_only_word_signatures_are_accepted(self):
        self.assertEqual(service.document_extension(service.DOC_SIGNATURE), ".doc")
        self.assertEqual(service.document_extension(service.DOCX_SIGNATURE), ".docx")
        with self.assertRaises(service.ConversionError):
            service.document_extension(b"not a word document")


class HandlerTests(unittest.TestCase):
    def setUp(self):
        self.server = service.HTTPServer(
            ("127.0.0.1", 0), service.make_handler("test-token")
        )
        self.thread = threading.Thread(
            target=self.server.serve_forever, daemon=True
        )
        self.thread.start()
        self.addCleanup(self.thread.join)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.url = "http://127.0.0.1:{}/convert".format(self.server.server_port)

    def request(self, headers=None, data=b"PK\x03\x04docx"):
        import urllib.error
        import urllib.request

        request = urllib.request.Request(
            self.url, data=data, headers=headers or {}, method="POST"
        )
        try:
            return urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            return error

    def test_requires_bearer_token_without_converting(self):
        with mock.patch.object(service, "convert_document") as convert:
            response = self.request()
        self.assertEqual(response.code, 401)
        self.assertEqual(response.read(), b"")
        convert.assert_not_called()

    def test_returns_pdf_for_authorized_request(self):
        with mock.patch.object(service, "convert_document", return_value=b"%PDF-test"):
            response = self.request({"Authorization": "Bearer test-token"})
        self.assertEqual(response.code, 200)
        self.assertEqual(response.headers["Content-Type"], "application/pdf")
        self.assertEqual(response.read(), b"%PDF-test")

    def test_rejects_oversized_request_before_reading_body(self):
        with socket.create_connection(
            ("127.0.0.1", self.server.server_port), timeout=2
        ) as connection:
            connection.sendall(
                (
                    "POST /convert HTTP/1.1\r\n"
                    "Host: localhost\r\n"
                    "Authorization: Bearer test-token\r\n"
                    "Content-Length: {}\r\n"
                    "Connection: close\r\n\r\n".format(service.MAX_REQUEST_BYTES + 1)
                ).encode("ascii")
            )
            response = connection.recv(512)
        self.assertIn(b"413", response)


if __name__ == "__main__":
    unittest.main()
