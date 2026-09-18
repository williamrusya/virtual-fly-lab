"""Verify sensory steering and closed-loop arrival in actual MuJoCo physics."""

import csv
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from virtual_fly_lab.main import run
from virtual_fly_lab.olfaction import odor_at, odor_command


class OlfactionTests(unittest.TestCase):
    def test_bilateral_sensing(self):
        sensors = np.array([[0, 0.2, 1], [0, -0.2, 1]])
        self.assertEqual(odor_command(odor_at(sensors, (5, 5)))[0], "left")
        self.assertEqual(odor_command(odor_at(sensors, (5, -5)))[0], "right")
        self.assertEqual(odor_command(odor_at(sensors, (5, 0)))[0], "forward")
        self.assertEqual(odor_command([0, 0])[0], "forward")
        np.testing.assert_allclose(odor_at([[0, 0, 0], [10, 0, 0]], (0, 0)),
                                   [1, np.exp(-1)])

    def test_reaches_sources_on_both_sides(self):
        with tempfile.TemporaryDirectory() as directory:
            for side, y in (("left", 8), ("right", -8)):
                with self.subTest(side=side):
                    output = Path(directory) / side
                    summary = run("odor", output, food_xy=(14, y), render=False, max_time=3)
                    self.assertEqual(summary["navigation"]["status"], "reached")
                    self.assertLess(summary["navigation"]["elapsed_s"], 3)
                    self.assertLessEqual(summary["food"]["final_distance_xy_mm"], 1.5)
                    with (output / "telemetry.csv").open(newline="", encoding="utf-8") as stream:
                        rows = list(csv.DictReader(stream))
                    self.assertEqual(rows[0]["command"], side)
                    self.assertGreater(float(rows[-1]["y_mm"]) * np.sign(y), 5)
                    for row in rows:
                        sensors = np.array(json.loads(row["antenna_positions_mm"]))
                        self.assertEqual(sensors.shape, (2, 3))
                        intensities = np.exp(-np.linalg.norm(sensors[:, :2] - (14, y), axis=1) / 10)
                        np.testing.assert_allclose([float(row["odor_left"]), float(row["odor_right"])], intensities)
                        command, drive = odor_command(intensities)
                        self.assertEqual(row["command"], command)
                        np.testing.assert_allclose([float(row["drive_left"]), float(row["drive_right"])], drive)
                        age = float(row["elapsed_s"]) - float(row["odor_sample_elapsed_s"])
                        self.assertGreaterEqual(age, 0)
                        self.assertLessEqual(age, 0.010001)

    def test_timeout_is_not_success(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = run("odor", Path(directory), render=False, max_time=0.02, food_xy=(50, 50))
            self.assertEqual(summary["navigation"]["status"], "timeout")
            self.assertFalse(summary["food"]["entered_patch_at_sample"])
            self.assertAlmostEqual(summary["navigation"]["elapsed_s"], 0.02)

    def test_invalid_timeout(self):
        with self.assertRaises(ValueError):
            run("odor", max_time=float("nan"))


if __name__ == "__main__":
    unittest.main()
