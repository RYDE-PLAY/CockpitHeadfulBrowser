#!/usr/bin/env python3
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend import session


class SettingsValidationTests(unittest.TestCase):
    def test_accepts_defaults_and_valid_http_urls(self):
        self.assertEqual(session.validate_settings({})["homepage"], "about:blank")
        result = session.validate_settings({"homepage": "https://example.test/path?q=1", "width": 1920})
        self.assertEqual(result["width"], 1920)

    def test_rejects_unsafe_schemes_and_control_characters(self):
        for homepage in (
            "javascript:alert(1)",
            "file:///tmp/a",
            "ftp://example.test/a",
            "http://example.test/\nX",
            "http://example.test/\x1f",
        ):
            with self.subTest(homepage=repr(homepage)):
                with self.assertRaises(session.SessionError) as raised:
                    session.validate_settings({"homepage": homepage})
                self.assertEqual(raised.exception.code, "invalid-settings")

    def test_rejects_wrong_types_unknown_fields_and_bounds(self):
        invalid = [
            {"unknown": 1},
            {"width": True},
            {"height": 599},
            {"height": 2161},
            {"idle_minutes": -1},
            {"idle_minutes": 1441},
            {"quality": "lossless"},
            {"homepage": 123},
            {"homepage": None},
        ]
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(session.SessionError) as raised:
                    session.validate_settings(value)
                self.assertEqual(raised.exception.code, "invalid-settings")


class PersistenceTests(unittest.TestCase):
    def test_atomic_json_is_private_and_replaces_existing_content(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            path.write_text('{"old": true}\n')
            session.atomic_json(path, {"new": "值"})
            self.assertEqual(json.loads(path.read_text()), {"new": "值"})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(list(Path(directory).glob("settings.json.*")), [])

    def test_atomic_json_preserves_old_file_when_serialization_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            path.write_text('{"old": true}\n')
            with self.assertRaises(TypeError):
                session.atomic_json(path, {"bad": object()})
            self.assertEqual(path.read_text(), '{"old": true}\n')
            self.assertEqual(list(Path(directory).glob("settings.json.*")), [])

    def test_settings_rejects_corrupt_json_and_unknown_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            path.write_text("{not json")
            instance = object.__new__(session.Session)
            instance.config_file = path
            with self.assertRaisesRegex(session.SessionError, "Saved settings are invalid"):
                instance.settings()
            path.write_text(json.dumps({"version": 2, "settings": {}}))
            with self.assertRaises(session.SessionError) as raised:
                instance.settings()
            self.assertEqual(raised.exception.code, "settings-version")

    def test_save_writes_validated_settings_and_keeps_status_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = object.__new__(session.Session)
            instance.config_file = Path(directory) / "settings.json"
            instance.status = mock.Mock(return_value={"state": "stopped"})
            result = instance.save({"homepage": "https://example.test"})
            self.assertEqual(result, {"state": "stopped"})
            self.assertEqual(json.loads(instance.config_file.read_text())["version"], 1)
            instance.status.assert_called_once_with()


class SafetyAndStatusTests(unittest.TestCase):
    def test_private_dir_rejects_existing_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.mkdir()
            link = Path(directory) / "link"
            link.symlink_to(target, target_is_directory=True)
            with self.assertRaises(session.SessionError) as raised:
                session.private_dir(link)
            self.assertEqual(raised.exception.code, "unsafe-directory")

    def test_private_dir_rejects_foreign_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session"
            with (
                mock.patch.object(os, "getuid", return_value=1000),
                mock.patch.object(Path, "lstat", return_value=mock.Mock(st_mode=stat.S_IFDIR | 0o700, st_uid=2000)),
            ):
                with self.assertRaises(session.SessionError) as raised:
                    session.private_dir(path)
            self.assertEqual(raised.exception.code, "unsafe-directory")

    def test_session_constructor_rejects_root_before_touching_filesystem(self):
        with mock.patch.object(os, "getuid", return_value=0), mock.patch.object(session, "private_dir") as private:
            with self.assertRaises(session.SessionError) as raised:
                session.Session()
            self.assertEqual(raised.exception.code, "root-not-supported")
            private.assert_not_called()

    def test_status_distinguishes_running_starting_and_error(self):
        instance = object.__new__(session.Session)
        instance.socket = Path("/socket-that-does-not-exist")
        instance.downloads = Path("/downloads")
        instance.state_file = Path("/state")
        instance.settings = mock.Mock(return_value={"homepage": "about:blank"})
        instance.checks = mock.Mock(return_value=[{"ok": True}])
        instance.systemctl = mock.Mock()
        instance.systemctl.return_value.stdout = "active\n"
        with mock.patch.object(session, "read_json", return_value={"state": "starting"}):
            self.assertEqual(instance.status()["state"], "starting")
        instance.socket = Path(tempfile.mktemp())
        Path(instance.socket).touch()
        try:
            with mock.patch.object(session, "read_json", return_value={"state": "running"}):
                self.assertEqual(instance.status()["state"], "running")
            instance.systemctl.return_value.stdout = "failed\n"
            with mock.patch.object(session, "read_json", return_value={"state": "error", "error": "boom"}):
                result = instance.status()
                self.assertEqual(result["state"], "error")
                self.assertEqual(result["error"], "boom")
        finally:
            Path(instance.socket).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
