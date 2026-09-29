"""
Regression tests for the 2026-09-30 model-methodology fixes:
  1 PPO reward / bandit formulation / held-out split
  2 untrained Mamba must not serve; Transformer provenance
  3 clean validation (embargo, separate tune slice)
  4 promotion gate (margin + proven net edge, block-bootstrap CI)
  5 checkpoint + normalization-schema rollback

Run from quant_engine/:  python3.12 -m unittest discover -s tests -v
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import promotion_gate as G  # noqa: E402


# ── 4. promotion gate ───────────────────────────────────────────────────────
class PromotionGateTest(unittest.TestCase):
    def test_directional_returns_signs_and_drops_hold_and_nan(self):
        pred = np.array([G.LONG, G.SHORT, G.HOLD, G.LONG, G.SHORT])
        ret = np.array([0.01, 0.01, 0.05, np.nan, -0.02])
        gross, keep = G.directional_returns(pred, ret)
        self.assertEqual(list(keep), [True, True, False, False, True])
        np.testing.assert_allclose(gross, [0.01, -0.01, 0.02])   # SHORT earns the negative

    def test_ci_of_a_constant_positive_series_is_above_zero(self):
        mean, lo, hi = G.block_bootstrap_ci(np.full(400, 0.002))
        self.assertAlmostEqual(mean, 0.002)
        self.assertGreater(lo, 0)

    def test_random_calls_have_no_proven_edge_and_are_refused(self):
        rng = np.random.default_rng(1)
        ret = rng.normal(0, 0.005, 6000)
        pred = rng.integers(0, 3, 6000)
        edge = G.economic_edge(pred, ret)
        self.assertTrue(edge["sufficient"])
        self.assertLess(edge["mean_net"], 0)                      # fees make random calls a loser
        ok, reason = G.decide_promotion(0.5, None, edge, floor_f1=0.34)
        self.assertFalse(ok)
        self.assertIn("no proven net edge", reason)

    def test_a_real_edge_is_promoted(self):
        rng = np.random.default_rng(2)
        ret = rng.normal(0, 0.005, 6000)
        pred = np.where(ret > 0, G.LONG, G.SHORT)                 # oracle: earns |ret| - fee
        edge = G.economic_edge(pred, ret)
        self.assertGreater(edge["ci_lo"], 0)
        ok, reason = G.decide_promotion(0.5, 0.45, edge, floor_f1=0.34)
        self.assertTrue(ok, reason)

    def test_too_few_calls_cannot_prove_an_edge(self):
        edge = G.economic_edge(np.full(50, G.LONG), np.full(50, 0.01))
        self.assertFalse(edge["sufficient"])
        ok, reason = G.decide_promotion(0.5, None, edge, floor_f1=0.34)
        self.assertFalse(ok)
        self.assertIn("too few", reason)

    def test_f1_margin_over_incumbent_is_required(self):
        good_edge = {"sufficient": True, "ci_lo": 0.001, "ci_hi": 0.002, "mean_net": 0.0015, "n_calls": 999}
        self.assertFalse(G.decide_promotion(0.4005, 0.400, good_edge, floor_f1=0.34)[0])   # +0.0005 is noise
        self.assertTrue(G.decide_promotion(0.42, 0.400, good_edge, floor_f1=0.34)[0])

    def test_trainer_specific_check_and_edge_switch(self):
        edge = {"sufficient": False, "ci_lo": None, "ci_hi": None, "mean_net": None, "n_calls": 0}
        ok, reason = G.decide_promotion(0.5, None, edge, floor_f1=0.34, extra_ok=False, extra_reason="collapsed")
        self.assertEqual((ok, reason), (False, "collapsed"))
        self.assertTrue(G.decide_promotion(0.5, None, edge, floor_f1=0.34, require_edge=False)[0])


# ── 3. clean validation ─────────────────────────────────────────────────────
def _synthetic_klines(n=3000, seed=0):
    rng = np.random.default_rng(seed)
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.002, n)))
    open_ = np.concatenate([[close[0]], close[:-1]])
    high = np.maximum(open_, close) * (1 + rng.uniform(0, 0.001, n))
    low = np.minimum(open_, close) * (1 - rng.uniform(0, 0.001, n))
    return pd.DataFrame({"symbol": "SYN", "timestamp": pd.date_range("2026-01-01", periods=n, freq="5min"),
                         "open": open_, "high": high, "low": low, "close": close,
                         "volume": rng.uniform(50, 150, n)})


class CleanValidationTest(unittest.TestCase):
    def setUp(self):
        import train_cnn as C
        self.C = C

    def test_embargo_between_train_tune_and_val(self):
        C, H = self.C, self.C.FORWARD_HORIZON
        n = 3000
        end_rows = np.arange(63, n)
        tr, tu, va, cut_tune, cut_val = C._split_masks(end_rows, n, C.TUNE_FRACTION)
        # every slice is disjoint
        self.assertFalse((tr & tu).any() or (tr & va).any() or (tu & va).any())
        # a training label (looks H bars ahead) never reaches into the tune slice...
        self.assertLess(end_rows[tr].max() + H, cut_tune)
        # ...and a tune label never reaches into validation
        self.assertLess(end_rows[tu].max() + H, cut_val)
        self.assertGreaterEqual(end_rows[va].min(), cut_val)
        self.assertGreater(tr.sum(), 0); self.assertGreater(tu.sum(), 0); self.assertGreater(va.sum(), 0)

    def test_no_tune_slice_when_not_requested(self):
        C = self.C
        end_rows = np.arange(63, 3000)
        _, tu, _, cut_tune, cut_val = C._split_masks(end_rows, 3000, 0.0)
        self.assertFalse(tu.any())
        self.assertEqual(cut_tune, cut_val)

    def test_dataset_exposes_tune_slice_and_validation_returns(self):
        C = self.C
        with patch.object(C, "SYMBOLS", ["AAA", "BBB"]), \
             patch.object(C, "fetch_klines_paginated", side_effect=lambda *a, **k: _synthetic_klines(seed=len(a[0]))):
            d = C._build_windowed_dataset(tune_fraction=C.TUNE_FRACTION)
        self.assertGreater(len(d["X_tune"]), 100)
        self.assertEqual(len(d["y_tune"]), len(d["X_tune"]))
        self.assertEqual(len(d["r_val"]), len(d["y_val"]))
        self.assertTrue(np.isfinite(d["r_val"]).all())
        # without a tune fraction the tune slice is empty (LSTM/CNN opt in)
        with patch.object(C, "SYMBOLS", ["AAA"]), patch.object(C, "fetch_klines_paginated", side_effect=lambda *a, **k: _synthetic_klines()):
            self.assertEqual(len(C._build_windowed_dataset()["X_tune"]), 0)

    def test_inplace_normalize_matches_copy_version(self):
        C = self.C
        X = np.random.default_rng(0).normal(3, 2, (10, 8, 12)).astype(np.float32)
        means, stds = X.reshape(-1, 12).mean(0), X.reshape(-1, 12).std(0)
        expected = C._normalize(X.copy(), means, stds)
        np.testing.assert_allclose(C._normalize_inplace(X.copy(), means, stds), expected, rtol=1e-5, atol=1e-5)

    def test_cycle_refuses_without_a_proven_edge_and_leaves_the_live_files_alone(self):
        C = self.C
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ckpt, schema = td / "cnn.pt", td / "schema.json"
            ckpt.write_bytes(b"LIVE-CHECKPOINT"); schema.write_text('{"LIVE": true}')
            paths = dict(CHECKPOINT_PATH=ckpt, BACKUP_PATH=td / "cnn.bak.pt", SCHEMA_PATH=schema,
                         SCHEMA_BACKUP_PATH=td / "schema.bak.json", STATE_PATH=td / "state.json")
            with patch.multiple(C, **paths), \
                 patch.object(C, "SYMBOLS", ["AAA", "BBB"]), \
                 patch.object(C, "fetch_klines_paginated", side_effect=lambda *a, **k: _synthetic_klines(seed=len(a[0]))), \
                 patch.object(C, "_update_training_report"):          # never touch the real report file
                result = C.train_cnn()
            self.assertFalse(result["promoted"])
            self.assertEqual(ckpt.read_bytes(), b"LIVE-CHECKPOINT")
            self.assertEqual(schema.read_text(), '{"LIVE": true}')
            state = json.loads((td / "state.json").read_text())
            self.assertFalse(state["last_attempt_promoted"])
            self.assertTrue(state["last_attempt_reason"])
            self.assertIn("n_calls", state["last_attempt_edge"])      # the edge is always recorded
            self.assertGreater(state["rows_tuned"], 0)


# ── 5. checkpoint + schema rollback ─────────────────────────────────────────
class RollbackTest(unittest.TestCase):
    def test_rollback_restores_checkpoint_and_normalization_stats_together(self):
        import train_cnn as C
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = dict(CHECKPOINT_PATH=td / "c.pt", BACKUP_PATH=td / "c.bak.pt", SCHEMA_PATH=td / "s.json",
                     SCHEMA_BACKUP_PATH=td / "s.bak.json", STATE_PATH=td / "state.json")
            with patch.multiple(C, **p):
                self.assertFalse(C.rollback_cnn())                     # nothing to roll back to
                p["CHECKPOINT_PATH"].write_bytes(b"NEW"); p["SCHEMA_PATH"].write_text("NEW-STATS")
                p["BACKUP_PATH"].write_bytes(b"OLD"); p["SCHEMA_BACKUP_PATH"].write_text("OLD-STATS")
                self.assertTrue(C.rollback_cnn())
                self.assertEqual(p["CHECKPOINT_PATH"].read_bytes(), b"OLD")
                self.assertEqual(p["SCHEMA_PATH"].read_text(), "OLD-STATS")   # the scale the old weights need

    def test_lstm_rollback(self):
        import train_lstm as L
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = dict(CHECKPOINT_PATH=td / "l.pt", BACKUP_PATH=td / "l.bak.pt", SCHEMA_PATH=td / "s.json",
                     SCHEMA_BACKUP_PATH=td / "s.bak.json")
            with patch.multiple(L, **p):
                self.assertFalse(L.rollback_lstm())
                p["CHECKPOINT_PATH"].write_bytes(b"NEW"); p["SCHEMA_PATH"].write_text("NEW")
                p["BACKUP_PATH"].write_bytes(b"OLD"); p["SCHEMA_BACKUP_PATH"].write_text("OLD")
                self.assertTrue(L.rollback_lstm())
                self.assertEqual((p["CHECKPOINT_PATH"].read_bytes(), p["SCHEMA_PATH"].read_text()), (b"OLD", "OLD"))


# ── 1. PPO ──────────────────────────────────────────────────────────────────
class _Fixed(nn.Module):
    """Policy that always picks one action."""
    def __init__(self, action, n=7):
        super().__init__(); self.action, self.n = action, n
    def forward(self, x):
        p = torch.zeros(x.shape[0], self.n); p[:, self.action] = 1.0
        return p, torch.zeros(x.shape[0], 1)


class PPOFormulationTest(unittest.TestCase):
    def setUp(self):
        import train_ppo as P
        self.P = P

    def test_version_and_bandit_constants(self):
        P = self.P
        self.assertEqual(P.REWARD_VERSION, 3)
        self.assertEqual(P.GAMMA, 0.0)                     # no bootstrapping across unrelated states
        self.assertEqual(P.REWARD_HORIZON_BARS, 5)         # same 25-minute horizon as the classifiers
        self.assertEqual(P.LOSS_AVERSION, 0.0)

    def test_reward_is_net_pnl_and_skip_is_zero(self):
        P = self.P
        self.assertEqual(P._action_reward(0, 0.05), 0.0)
        self.assertAlmostEqual(P._action_reward(1, 0.004), 0.004 - 0.001)
        self.assertAlmostEqual(P._action_reward(1, -0.004), -0.004 - 0.001)   # no extra loss penalty
        # a 25-minute move of +0.3% beats skipping (the v2 per-5m-bar hurdle made this impossible)
        self.assertGreater(P._action_reward(1, 0.003), 0.0)
        self.assertLess(P._action_reward(1, 0.0), 0.0)                       # zero edge still pays the fee

    def test_split_env_holds_out_the_newest_slice_with_an_embargo(self):
        P = self.P
        n = 1000
        env = type("E", (), {})()
        env.states = np.arange(n * P.STATE_DIM, dtype=np.float32).reshape(n, P.STATE_DIM)
        env.returns = np.arange(n, dtype=np.float64)                       # return == position -> easy to inspect
        env.groups = [(0, 500), (500, 1000)]                               # two chronological blocks (symbols)
        tr, ho = P.split_env(env, 0.2, embargo=5)
        # newest 20% of each block held out
        self.assertEqual(sorted(ho.returns.tolist()), list(range(400, 500)) + list(range(900, 1000)))
        # training stops `embargo` steps before the held-out region of each block
        self.assertEqual(int(tr.returns[tr.returns < 500].max()), 394)
        self.assertEqual(int(tr.returns.max()), 894)
        self.assertFalse(set(tr.returns.tolist()) & set(ho.returns.tolist()))

    def test_evaluate_policy_greedy_and_baselines(self):
        P = self.P
        rng = np.random.default_rng(0)
        env = P.ArrayEnv(rng.normal(size=(300, P.STATE_DIM)).astype(np.float32), rng.normal(0, 0.004, 300))
        skip = P.evaluate_policy(_Fixed(0), env)
        self.assertEqual((skip["avg_reward_per_step"], skip["trade_share"]), (0.0, 0.0))
        normal = P.evaluate_policy(_Fixed(1), env)
        self.assertAlmostEqual(normal["avg_reward_per_step"], normal["always_normal_avg"])
        self.assertEqual(normal["trade_share"], 1.0)


# ── 2. Mamba / Transformer provenance ───────────────────────────────────────
class ProvenanceTest(unittest.TestCase):
    def _fake_mamba_checkpoint(self, path, trained):
        sd = {"feature_embedding.weight": torch.zeros(40000), "pos_embedding": torch.zeros(10),
              "mamba_stack.layers.0.w": torch.zeros(10), "head.weight": torch.zeros(10)}
        payload = {"model_state_dict": sd}
        if trained is not None:
            payload["trained"] = trained
        torch.save(payload, path)

    def test_mamba_refuses_a_checkpoint_without_a_trained_flag(self):
        from mambaPredictor import MambaPredictor
        with tempfile.TemporaryDirectory() as td:
            for trained in (None, False):
                ck = Path(td) / f"m_{trained}.pt"
                self._fake_mamba_checkpoint(ck, trained)
                m = MambaPredictor(model_path=ck)
                self.assertFalse(m.checkpoint_loaded)
                self.assertTrue(str(m.degraded_reason).startswith("UNTRAINED_CHECKPOINT"))
                out = m.predict(np.zeros((8, 12)))
                self.assertEqual((out["direction"], out["error"]), ("HOLD", "MODEL_DEGRADED"))

    def test_the_generator_marks_its_output_untrained(self):
        src = (Path(__file__).resolve().parent.parent / "generate_mamba_production.py").read_text()
        self.assertIn("'trained': False", src)
        self.assertIn("RANDOM_INIT_NO_TRAINING", src)

    def test_transformer_provenance_sidecar(self):
        from transformerPredictor import TransformerPredictor
        with tempfile.TemporaryDirectory() as td:
            ck = Path(td) / "t.pt"
            self.assertEqual(TransformerPredictor._read_provenance(ck), "UNVERIFIED_NO_TRAINING_PIPELINE")
            Path(str(ck) + ".meta.json").write_text(json.dumps({"trained": True}))
            self.assertEqual(TransformerPredictor._read_provenance(ck), "TRAINED")
            Path(str(ck) + ".meta.json").write_text(json.dumps({"trained": False}))
            self.assertEqual(TransformerPredictor._read_provenance(ck), "UNTRAINED")


# ── end-to-end smoke: every trainer runs a full cycle on synthetic data ──────
class TrainerCyclesTest(unittest.TestCase):
    def test_ppo_cycle_uses_a_heldout_slice_and_reports_it(self):
        import train_ppo as P
        rng = np.random.default_rng(0)
        n = 1500
        env = P.ArrayEnv(rng.normal(size=(n, P.STATE_DIM)).astype(np.float32), rng.normal(0, 0.004, n))
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            with patch.multiple(P, CHECKPOINT_PATH=td / "p.pt", BACKUP_PATH=td / "p.bak.pt", STATE_PATH=td / "state.json"), \
                 patch.object(P, "_build_env", return_value=(env, "synthetic_candles")), \
                 patch.object(P, "_update_training_report"):
                res = P.train_ppo()
            self.assertIn("heldout", res)
            self.assertGreater(res["heldout"]["steps"], 100)
            state = json.loads((td / "state.json").read_text())
            self.assertIn("last_attempt_heldout_avg_reward_per_step", state)
            # the training reward is informational only; promotion follows the held-out figure
            self.assertEqual(res["promoted"], state["last_attempt_promoted"])
            if res["promoted"]:
                self.assertGreaterEqual(state["last_promoted_heldout_avg_reward_per_step"], 0.0)

    def test_lstm_cycle_early_stops_on_tune_and_records_the_edge(self):
        import train_cnn as C
        import train_lstm as L
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ckpt, schema = td / "l.pt", td / "s.json"
            ckpt.write_bytes(b"LIVE"); schema.write_text('{"LIVE": true}')
            with patch.multiple(L, CHECKPOINT_PATH=ckpt, BACKUP_PATH=td / "l.bak.pt", SCHEMA_PATH=schema,
                                SCHEMA_BACKUP_PATH=td / "s.bak.json", STATE_PATH=td / "state.json"), \
                 patch.object(C, "SYMBOLS", ["AAA", "BBB"]), \
                 patch.object(C, "fetch_klines_paginated", side_effect=lambda *a, **k: _synthetic_klines(seed=len(a[0]))):
                res = L.train_lstm()
            self.assertGreater(res["tune_windows"], 100)
            self.assertIn("n_calls", res["edge"])
            self.assertFalse(res["promoted"])                     # random data has no edge
            self.assertEqual(ckpt.read_bytes(), b"LIVE")          # live checkpoint untouched
            self.assertEqual(schema.read_text(), '{"LIVE": true}')

    def test_gbm_cycle_uses_the_gate_and_embargoed_split(self):
        import train_gbm as B
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            with patch.multiple(B, MODEL_DIR=td, CHECKPOINT_PATH=td / "g.joblib", BACKUP_PATH=td / "g.bak.joblib",
                                STATE_PATH=td / "state.json"), \
                 patch.object(B, "SYMBOLS", ["AAA", "BBB"]), \
                 patch.object(B, "fetch_klines_paginated", side_effect=lambda *a, **k: _synthetic_klines(seed=len(a[0]))):
                res = B.train_gbm()
            self.assertFalse(res["promoted"])
            self.assertIn("edge", res)
            state = json.loads((td / "state.json").read_text())
            self.assertTrue(state["last_attempt_reason"])
            self.assertIn("n_calls", state["last_attempt_edge"])

    def test_gbm_split_embargoes_the_last_training_rows(self):
        import train_gbm as B
        H = B.FORWARD_HORIZON
        rows = np.arange(1000, dtype=np.float32).reshape(1000, 1)
        fut = np.random.default_rng(0).normal(0, 0.003, 1000)
        Xtr, ytr, Xte, yte, fte = B._split([(rows, fut)], 0.8, 1.0)
        self.assertEqual(int(Xtr.max()), 800 - H - 1)             # last H training rows dropped
        self.assertEqual(int(Xte.min()), 800)
        self.assertEqual(len(fte), len(yte))


if __name__ == "__main__":
    unittest.main()
