"""Integration checks against real MuJoCo physics, not mocked movement."""

import csv
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from virtual_fly_lab.main import run


class LocomotionTests(unittest.TestCase):
    def test_food_distance_and_no_navigation(self):
        with tempfile.TemporaryDirectory() as directory:
            trajectories = []
            for name, center in (("near", (14, 3)), ("far", (-20, 15))):
                output = Path(directory) / name
                summary = run("food", output, render=False, food_xy=center)
                with (output / "telemetry.csv").open(newline="", encoding="utf-8") as stream:
                    rows = list(csv.DictReader(stream))
                xy = np.array([[float(row["x_mm"]), float(row["y_mm"])] for row in rows])
                distances = np.linalg.norm(xy - center, axis=1)
                np.testing.assert_allclose(
                    [float(row["food_distance_xy_mm"]) for row in rows], distances)
                self.assertEqual([row["inside_food_patch"] == "True" for row in rows],
                                 (distances <= summary["food"]["radius_mm"]).tolist())
                self.assertAlmostEqual(summary["food"]["initial_distance_xy_mm"], distances[0])
                self.assertAlmostEqual(summary["food"]["final_distance_xy_mm"], distances[-1])
                self.assertAlmostEqual(summary["food"]["minimum_sampled_distance_xy_mm"], min(distances))
                self.assertEqual(summary["food"]["entered_patch_at_sample"], name == "near")
                trajectories.append(xy)
            # Food is only a visible location in MVP 2; it cannot steer the fly.
            np.testing.assert_allclose(*trajectories, atol=1e-8, rtol=0)

    def test_rendered_standing_fly(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            summary = run("smoke", output)
            self.assertGreater(summary["rendered_frames"], 10)
            self.assertGreater((output / "simulation.mp4").stat().st_size, 1000)
            self.assertAlmostEqual(summary["warmup_s"], 0.05)

    def test_physical_forward_and_turning(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            summary = run("demo", output, render=False)
            segments = summary["segments"]
            self.assertEqual([s["command"] for s in segments],
                             ["forward", "left", "forward", "right", "forward"])
            for segment in (segments[0], segments[2], segments[4]):
                self.assertGreater(segment["forward_displacement_mm"], 1.0)
            self.assertGreater(segments[1]["heading_change_deg"], 10.0)
            self.assertLess(segments[3]["heading_change_deg"], -10.0)
            with (output / "telemetry.csv").open(newline="", encoding="utf-8") as stream:
                rows = list(csv.DictReader(stream))
            values = np.array([[float(row[k]) for k in
                               ("simulation_s", "x_mm", "y_mm", "z_mm", "yaw_rad")]
                              for row in rows])
            self.assertTrue(np.isfinite(values).all())
            self.assertTrue((np.diff(values[:, 0]) >= 0).all())
            self.assertGreater(values[:, 3].min(), 0.5)
            self.assertAlmostEqual(float(rows[-1]["elapsed_s"]), 2.6)
            for row in rows:
                quaternion = [float(row[k]) for k in ("qw", "qx", "qy", "qz")]
                self.assertAlmostEqual(np.linalg.norm(quaternion), 1.0)
                self.assertEqual(len(json.loads(row["joint_targets_rad"])), 42)
                self.assertEqual(len(json.loads(row["adhesion_onoff"])), 6)


if __name__ == "__main__":
    unittest.main()
