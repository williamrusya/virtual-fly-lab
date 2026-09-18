"""MVP 3 assumptions: ideal bilateral sensors in a static radial odor field."""

import numpy as np

ODOR_LENGTH_MM = 10.0
RELATIVE_DEADBAND = 0.002


def odor_at(sensor_positions, source_xy):
    """Unitless C=exp(-horizontal distance/10 mm); no wind, noise, or height effect."""
    distances = np.linalg.norm(np.asarray(sensor_positions)[:, :2] - source_xy, axis=1)
    return np.exp(-distances / ODOR_LENGTH_MM)


def odor_command(readings):
    """Select a command using only two intensities, never source coordinates."""
    left, right = readings
    contrast = (left - right) / max(left + right, 1e-12)
    if contrast > RELATIVE_DEADBAND:
        return "left", np.array([0.4, 1.2])
    if contrast < -RELATIVE_DEADBAND:
        return "right", np.array([1.2, 0.4])
    return "forward", np.ones(2)
