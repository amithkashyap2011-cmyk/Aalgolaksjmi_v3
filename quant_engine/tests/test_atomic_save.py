import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import promotion_gate


class AtomicSaveTest(unittest.TestCase):
    def test_replaces_and_cleans(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.pt"
            p.write_text("old")
            promotion_gate.atomic_save(p, lambda t: Path(t).write_text("new"))
            self.assertEqual(p.read_text(), "new")
            self.assertFalse((Path(d) / "m.pt.tmp").exists())

    def test_failure_keeps_incumbent(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.pt"
            p.write_text("old")

            def boom(t):
                Path(t).write_text("torn")
                raise RuntimeError("crash mid-save")

            with self.assertRaises(RuntimeError):
                promotion_gate.atomic_save(p, boom)
            self.assertEqual(p.read_text(), "old")
            self.assertFalse((Path(d) / "m.pt.tmp").exists())


if __name__ == "__main__":
    unittest.main()
