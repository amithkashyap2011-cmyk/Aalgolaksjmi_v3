import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import torch
import ppo_replay_buffer as rb
import cnn_predictor as cp
from feature_schema import FeatureSchemaV8


class ReplayCompactTest(unittest.TestCase):
    def test_append_during_compact_is_kept(self):
        with tempfile.TemporaryDirectory() as d:
            orig = rb.BUFFER_PATH
            rb.BUFFER_PATH = Path(d) / "b.jsonl"
            real_load = rb.load_records
            try:
                for i in range(10):
                    rb.record([float(i)], "X")

                def load_then_append(upto=None):
                    out = real_load(upto)
                    rb.record([99.0], "LATE")  # lands after the loaded offset
                    return out
                rb.load_records = load_then_append
                rb.compact(max_records=5)
                rb.load_records = real_load
                recs = rb.load_records()
                self.assertEqual(len(recs), 6)
                self.assertEqual(recs[-1]["symbol"], "LATE")
            finally:
                rb.load_records = real_load
                rb.BUFFER_PATH = orig


class StampTest(unittest.TestCase):
    def _pred(self):
        p = cp.CNNPredictor.__new__(cp.CNNPredictor)
        p.schema = FeatureSchemaV8()
        p.checkpoint_loaded = False
        p.model = cp.CNN1D()
        p._lock = threading.Lock()
        return p

    def test_unwrap(self):
        self.assertEqual(cp.unwrap_checkpoint({"a": 1}), ({"a": 1}, None))
        self.assertEqual(cp.unwrap_checkpoint({"MODEL_STAMP": "s", "state_dict": {"a": 1}}), ({"a": 1}, "s"))

    def test_mismatch_keeps_old(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "c.pt"
            torch.save({"MODEL_STAMP": "B", "state_dict": cp.CNN1D().state_dict()}, path)
            p = self._pred()
            old = FeatureSchemaV8.STAMP
            try:
                FeatureSchemaV8.STAMP = "A"
                before = p.model
                self.assertFalse(p._load(path))
                self.assertIs(p.model, before)
                self.assertFalse(p.checkpoint_loaded)
                FeatureSchemaV8.STAMP = "B"
                self.assertTrue(p._load(path))
                self.assertTrue(p.checkpoint_loaded)
            finally:
                FeatureSchemaV8.STAMP = old

    def test_legacy_pair_loads(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "c.pt"
            torch.save(cp.CNN1D().state_dict(), path)
            p = self._pred()
            old = FeatureSchemaV8.STAMP
            try:
                FeatureSchemaV8.STAMP = None
                self.assertTrue(p._load(path))
            finally:
                FeatureSchemaV8.STAMP = old


if __name__ == "__main__":
    unittest.main()
