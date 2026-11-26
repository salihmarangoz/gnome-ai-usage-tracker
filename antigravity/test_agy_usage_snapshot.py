# SPDX-License-Identifier: MIT
"""Tests for agy-usage-snapshot: python3 -m unittest discover -s antigravity"""
import importlib.machinery
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

loader = importlib.machinery.SourceFileLoader(
    "snapshot", str(Path(__file__).with_name("agy-usage-snapshot")))
spec = importlib.util.spec_from_loader("snapshot", loader)
snapshot = importlib.util.module_from_spec(spec)
loader.exec_module(snapshot)

# agy 1.5.17, Antigravity Starter Quota (the Gemini group has no 5-hour limit)
SCREEN = """\
└ Models & Quota
  Account: name@example.com
GEMINI MODELS
  Models within this group: Gemini 4 Hydrogen, Gemini 3.8 Flash
  Weekly Limit Remaining
    [██████████████████████████████████████████████░░░░] 92.55%
    Refreshes in 6d 23h 0m
CLAUDE AND GPT MODELS
  Models within this group: Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B
  Weekly Limit Remaining
    [██████████████████████████████████████████████████] 100.00%
    Quota available
  Five Hour Limit Remaining
    [██████████████████████████████████████████████████] 100.00%
    Quota available
  │Within each group, models share a weekly limit and a 5-hour limit. Quota is
  │consumed proportionally to the cost of the tokens. Thus, limits will last
  │longer with shorter tasks or using more cost-effective models. The 5-hour
  │limit smooths out aggregate demand to fairly distribute global capacity
  │across all users, while your weekly limit is tied directly to your individual
  │tier.
  ↑/↓ Scroll · pgup/pgdown Page · ctrl+end Bottom · ctrl+home Top · esc Close
""".splitlines()
BOOT = ["     ▀▀▀▀▀▀       name@example.com (Antigravity Starter Quota)"]
NOW = 1_000_000


def parse(lines):
    return snapshot.parse(BOOT, lines, NOW)


class ParseTest(unittest.TestCase):
    def test_screen(self):
        plan, groups = parse(SCREEN)
        self.assertEqual(plan, "Antigravity Starter Quota")
        self.assertEqual([g["id"] for g in groups], ["gemini", "claude-and-gpt"])
        self.assertEqual(groups[0]["windows"], [
            {"name": "Weekly", "seconds": 604800, "remaining": 92.55,
             "resetsAt": NOW + 6 * 86400 + 23 * 3600}])
        self.assertEqual([(w["name"], w["remaining"], w["resetsAt"]) for w in groups[1]["windows"]],
                         [("Weekly", 100.0, None), ("5-hour", 100.0, None)])

    def test_renamed_heading_is_a_group_of_its_own(self):
        lines = [l.replace("CLAUDE AND GPT MODELS", "Claude, GPT-OSS models") for l in SCREEN]
        _, groups = parse(lines)
        self.assertEqual([g["id"] for g in groups], ["gemini", "claude-gpt-oss"])
        self.assertEqual(len(groups[0]["windows"]), 1)

    def test_limits_without_their_group_heading(self):
        lines = [l for l in SCREEN if "Claude Sonnet" not in l]
        with self.assertRaises(RuntimeError):
            parse(lines)

    def test_limit_without_percentage(self):
        lines = [l for l in SCREEN if "92.55%" not in l]
        with self.assertRaises(RuntimeError):
            parse(lines)

    def test_no_limits(self):
        with self.assertRaises(RuntimeError):
            parse(SCREEN[:2])

    def test_durations(self):
        self.assertEqual(snapshot.parse_duration("Refreshes in 5d 4h 20m"), 447600)
        self.assertEqual(snapshot.parse_duration("Refreshes in 5d4h20m"), 447600)


class StateTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        out = Path(self.dir.name) / "usage.json"
        patcher = mock.patch.object(snapshot, "OUT", out)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.out = out

    def test_broken_snapshot_counts_as_none(self):
        for content in ["[]", "null", '{"groups": [{}]}', "{"]:
            self.out.write_text(content)
            self.assertEqual(snapshot.load_previous(), {})

    def test_locked_keyring_is_checked_on_every_run(self):
        prev = {"error": snapshot.KEYRING_ERROR, "errorAt": NOW - 60}
        self.assertTrue(snapshot.needs_update(prev, NOW))

    def test_other_errors_wait_an_hour(self):
        prev = {"error": "agy /usage: x", "errorAt": NOW - 60}
        with mock.patch.object(snapshot, "last_agy_activity", return_value=0):
            self.assertIsNone(snapshot.needs_update(prev, NOW))


class ExtensionSettingsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        schemas = Path(self.dir.name) / "gnome-shell/extensions" / snapshot.UUID / "schemas"
        schemas.mkdir(parents=True)
        (schemas / "gschemas.compiled").touch()
        patcher = mock.patch.dict(os.environ, {"XDG_DATA_HOME": self.dir.name})
        patcher.start()
        self.addCleanup(patcher.stop)

    def shows(self, values):
        def run(*args):
            return values.get(args[-1])
        with mock.patch.object(snapshot, "run", run):
            return snapshot.extension_shows_agy()

    def settings(self, **values):
        base = {"disable-user-extensions": "false",
                "enabled-extensions": f"['{snapshot.UUID}']",
                "agy-gemini-show": "'off'", "agy-claude-show": "'off'"}
        base.update({k.replace("_", "-"): v for k, v in values.items()})
        return base

    def test_service_on(self):
        self.assertTrue(self.shows(self.settings(agy_claude_show="'menu'")))

    def test_services_off(self):
        self.assertFalse(self.shows(self.settings()))

    def test_extension_disabled(self):
        self.assertFalse(self.shows(self.settings(enabled_extensions="@as []",
                                                  agy_gemini_show="'both'")))

    def test_user_extensions_disabled(self):
        self.assertFalse(self.shows(self.settings(disable_user_extensions="true",
                                                  agy_gemini_show="'both'")))

    def test_extension_without_antigravity(self):
        values = self.settings()
        del values["agy-gemini-show"], values["agy-claude-show"]
        self.assertFalse(self.shows(values))

    def test_extension_not_installed(self):
        with mock.patch.dict(os.environ, {"XDG_DATA_HOME": "/nonexistent", "XDG_DATA_DIRS": "/nonexistent"}):
            self.assertFalse(self.shows(self.settings(agy_gemini_show="'both'")))


if __name__ == "__main__":
    unittest.main()
