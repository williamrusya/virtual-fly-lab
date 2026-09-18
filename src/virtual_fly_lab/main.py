"""Run the FlyGym 2.1 hybrid locomotion controller on flat ground."""

import argparse
import csv
import json
import logging
from importlib.metadata import version
from pathlib import Path

import mujoco
import numpy as np
from flygym import Simulation
from flygym.anatomy import BodySegment, ContactBodiesPreset
from flygym.compose import FlatGroundWorld
from flygym.utils.math import Rotation3D
from flygym_demo.complex_terrain import (
    HybridControllerObservation,
    HybridTurningController,
    LocomotionAction,
    PreprogrammedSteps,
    apply_locomotion_action,
    make_locomotion_fly,
)
from virtual_fly_lab.olfaction import odor_at, odor_command, ODOR_LENGTH_MM, RELATIVE_DEADBAND

LOG = logging.getLogger(__name__)
FOOD_RADIUS_MM = 1.5


def walk_forward():
    """Equal left/right descending drive; the controller generates leg motion."""
    return np.array([1.0, 1.0])


def turn_left():
    """Reduce left-side stepping amplitude to curve counterclockwise (+yaw)."""
    return np.array([0.4, 1.2])


def turn_right():
    """Reduce right-side stepping amplitude to curve clockwise (-yaw)."""
    return np.array([1.2, 0.4])


def run(mode="demo", output=Path("outputs/demo"), *, seed=0, render=True,
        food_xy=(14.0, 3.0), max_time=6.0):
    """Run a bounded scripted or odor-driven experiment and save its results."""
    schedules = {
        "smoke": [("stand", 0.1, None)],
        "forward": [("forward", 1.0, walk_forward)],
        "food": [("forward", 1.0, walk_forward)],
        "odor": [("odor_navigation", max_time, None)],
        "demo": [
            ("forward", 0.6, walk_forward),
            ("left", 0.4, turn_left),
            ("forward", 0.6, walk_forward),
            ("right", 0.4, turn_right),
            ("forward", 0.6, walk_forward),
        ],
    }
    if mode not in schedules:
        raise ValueError(f"Unknown mode: {mode}")
    if not np.isfinite(max_time) or not 0.01 <= max_time <= 30:
        raise ValueError("max_time must be between 0.01 and 30 seconds")
    has_food = mode in ("food", "odor")
    food_xy = np.asarray(food_xy, dtype=float)
    if food_xy.shape != (2,) or not np.isfinite(food_xy).all():
        raise ValueError("food_xy must contain two finite coordinates in mm")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    # The upstream helper composes NeuroMechFly with 42 position-controlled leg
    # DOFs, passive distal tarsi, and switchable foot adhesion.
    fly = make_locomotion_fly(name="fly", add_adhesion=True, colorize=True)
    camera = fly.add_tracking_camera(
        name="body_cam", pos_offset=(-0.5, -7.5, 0.0),
        rotation=Rotation3D("euler", (1.57, 0.0, 0.0)), fovy=35.0,
    )
    world = FlatGroundWorld()
    if has_food:
        # A thin food patch marks a location, not a physical obstacle or an odor
        # field. Collision masks keep the original flat-ground dynamics intact.
        world.mjcf_root.worldbody.add_geom(
            name="food_patch", type=mujoco.mjtGeom.mjGEOM_CYLINDER,
            pos=(*food_xy, 0.025), size=(FOOD_RADIUS_MM, 0.025, 0),
            rgba=(1.0, 0.35, 0.04, 1.0), contype=0, conaffinity=0,
        )
        # Fixed overhead view includes the initial walk and the food location.
        lower = np.minimum((-6.0, -8.0), food_xy - FOOD_RADIUS_MM - 5)
        upper = np.maximum((18.0, 8.0), food_xy + FOOD_RADIUS_MM + 5)
        center = (lower + upper) / 2
        height = max((upper - lower)[1], (upper - lower)[0] * 0.75) / (
            2 * np.tan(np.deg2rad(45 / 2))
        ) + 3
        camera = world.mjcf_root.worldbody.add_camera(
            name="arena_overview", pos=(*center, height), quat=(1, 0, 0, 0), fovy=45,
        )
    world.add_fly(
        fly, [0, 0, 0.8], Rotation3D("quat", [1, 0, 0, 0]),
        bodysegs_with_ground_contact=ContactBodiesPreset.TIBIA_TARSUS_ONLY,
        add_ground_contact_sensors=False,
    )
    sim = Simulation(world, timestep=0.0001)
    try:
        renderer = sim.set_renderer(
            camera, camera_res=(480, 640) if has_food else (240, 320),
            playback_speed=0.2 if mode == "odor" else 0.1, output_fps=25,
        ) if render else None
        sim.reset()
        steps = PreprogrammedSteps()
        dofs = fly.get_actuated_jointdofs_order("position")
        action = LocomotionAction(
            steps.default_pose_by_dof_order(dofs), np.ones(6, dtype=bool),
        )
        apply_locomotion_action(sim, fly.name, action)
        # Settle onto the ground before starting the CPG clock or command schedule.
        sim.warmup(duration_s=0.05)
        mujoco.mj_forward(sim.mj_model, sim.mj_data)
        controller = None
        if mode != "smoke":
            controller = HybridTurningController(
                timestep=sim.timestep, preprogrammed_steps=steps, output_dof_order=dofs,
            )
            controller.reset(seed=seed)
        thorax = fly.get_bodysegs_order().index(BodySegment("c_thorax"))
        # FlyGym 2.1 has no built-in odor readout. Use the actual simulated
        # antennal funiculus body origins as idealized left/right point sensors.
        antenna_indices = [fly.get_bodysegs_order().index(BodySegment(f"{side}_funiculus"))
                           for side in ("l", "r")]
        sensor_positions = None
        readings = None
        sensor_time = None
        reached = False
        start_time = float(sim.mj_data.time)
        rows = []
        segments = []
        fieldnames = [
            "elapsed_s", "simulation_s", "segment", "command",
            "x_mm", "y_mm", "z_mm", "qw", "qx", "qy", "qz", "yaw_rad",
            "drive_left", "drive_right", "joint_targets_rad", "adhesion_onoff",
        ]
        if has_food:
            fieldnames += ["food_distance_xy_mm", "inside_food_patch"]
        if mode == "odor":
            fieldnames += ["odor_left", "odor_right", "odor_sample_elapsed_s",
                           "antenna_positions_mm"]
        with (output / "telemetry.csv").open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=fieldnames)
            writer.writeheader()

            def record(segment, command, drive):
                pos = sim.get_body_positions(fly.name)[thorax]
                quat = sim.get_body_rotations(fly.name)[thorax]
                w, x, y, z = quat
                yaw = np.arctan2(2 * (w*z + x*y), 1 - 2 * (y*y + z*z))
                row = {
                    "elapsed_s": float(sim.mj_data.time) - start_time,
                    "simulation_s": float(sim.mj_data.time),
                    "segment": segment, "command": command,
                    "x_mm": float(pos[0]), "y_mm": float(pos[1]), "z_mm": float(pos[2]),
                    "qw": float(w), "qx": float(x), "qy": float(y), "qz": float(z),
                    "yaw_rad": float(yaw), "drive_left": float(drive[0]),
                }
                row.update(
                    drive_right=float(drive[1]),
                    joint_targets_rad=json.dumps(action.joint_angles.tolist()),
                    adhesion_onoff=json.dumps(action.adhesion_onoff.astype(int).tolist()),
                )
                if has_food:
                    distance = float(np.linalg.norm(pos[:2] - food_xy))
                    row.update(food_distance_xy_mm=distance,
                               inside_food_patch=distance <= FOOD_RADIUS_MM)
                if mode == "odor":
                    row.update(odor_left=float(readings[0]), odor_right=float(readings[1]),
                               odor_sample_elapsed_s=sensor_time,
                               antenna_positions_mm=json.dumps(sensor_positions.tolist()))
                writer.writerow(row)
                rows.append(row)
                return row

            for index, (command, duration, drive_fn) in enumerate(schedules[mode]):
                drive = drive_fn() if drive_fn else np.zeros(2)
                if mode == "odor":
                    sensor_positions = sim.get_body_positions(fly.name)[antenna_indices]
                    readings = odor_at(sensor_positions, food_xy)
                    sensor_time = float(sim.mj_data.time) - start_time
                    command, drive = odor_command(readings)
                first = record(index, command, drive)
                last = first
                reached = mode == "odor" and first["inside_food_patch"]
                if renderer:
                    sim.render_as_needed()
                LOG.info("t=%.3fs command=%s drive=%s", first["elapsed_s"], command, drive)
                sample_every = round(0.01 / sim.timestep)
                nsteps = round(duration / sim.timestep)
                for tick in range(nsteps):
                    if reached:
                        break
                    if mode == "odor" and tick % sample_every == 0:
                        sensor_positions = sim.get_body_positions(fly.name)[antenna_indices]
                        readings = odor_at(sensor_positions, food_xy)
                        sensor_time = float(sim.mj_data.time) - start_time
                        command, drive = odor_command(readings)
                    if controller:
                        obs = HybridControllerObservation.from_sim(sim, fly.name)
                        action = controller.step(drive, obs)
                        apply_locomotion_action(sim, fly.name, action)
                    sim.step()
                    if not np.isfinite(sim.mj_data.qpos).all():
                        raise RuntimeError("Non-finite physics state")
                    # mj_step integrates qpos after computing body transforms;
                    # refresh before sampling so pose and logged time agree.
                    if (tick + 1) % sample_every == 0 or tick == nsteps - 1:
                        mujoco.mj_forward(sim.mj_model, sim.mj_data)
                        last = record(index, command, drive)
                        reached = mode == "odor" and last["inside_food_patch"]
                        if mode == "odor" and (tick + 1) % round(0.5 / sim.timestep) == 0:
                            LOG.info("t=%.2f odor=(%.4f, %.4f) command=%s distance=%.2f mm",
                                     last["elapsed_s"], *readings, command, last["food_distance_xy_mm"])
                    if renderer:
                        sim.render_as_needed()
                segment_rows = [row for row in rows if row["segment"] == index]
                yaw_values = np.unwrap([row["yaw_rad"] for row in segment_rows])
                displacement = [last[key] - first[key] for key in ("x_mm", "y_mm", "z_mm")]
                result = {
                    "command": "odor_navigation" if mode == "odor" else command,
                    "duration_s": last["elapsed_s"] - first["elapsed_s"],
                    "displacement_mm": displacement,
                    "heading_change_deg": float(np.rad2deg(yaw_values[-1] - yaw_values[0])),
                    "forward_displacement_mm": float(
                        displacement[0] * np.cos(first["yaw_rad"])
                        + displacement[1] * np.sin(first["yaw_rad"])
                    ),
                }
                segments.append(result)
                LOG.info("position=(%.3f, %.3f, %.3f) mm yaw=%.1f deg; segment turn=%.1f deg",
                         last["x_mm"], last["y_mm"], last["z_mm"],
                         np.rad2deg(last["yaw_rad"]), result["heading_change_deg"])
                if has_food:
                    LOG.info("Distance to food center: %.3f -> %.3f mm (XY)",
                             first["food_distance_xy_mm"], last["food_distance_xy_mm"])
        if np.any(sim.mj_data.warning.number):
            raise RuntimeError(f"MuJoCo reported warnings: {sim.mj_data.warning.number}")
        frame_count = 0
        if renderer:
            renderer.save_video(output / "simulation.mp4")
            frames = next(iter(renderer.frames.values()))
            frame_count = len(frames)
        summary = {
            "mode": mode, "seed": seed, "timestep_s": sim.timestep,
            "warmup_s": start_time, "rendered_frames": frame_count,
            "versions": {name: version(name) for name in ("flygym", "mujoco", "numpy")},
            "joint_dof_order": [str(dof) for dof in dofs],
            "segments": segments,
        }
        if has_food:
            summary["food"] = {
                "center_xy_mm": food_xy.tolist(), "radius_mm": FOOD_RADIUS_MM,
                "initial_distance_xy_mm": rows[0]["food_distance_xy_mm"],
                "final_distance_xy_mm": rows[-1]["food_distance_xy_mm"],
                "minimum_sampled_distance_xy_mm": min(row["food_distance_xy_mm"] for row in rows),
                "entered_patch_at_sample": any(row["inside_food_patch"] for row in rows),
            }
        if mode == "odor":
            summary["navigation"] = {
                "status": "reached" if reached else "timeout",
                "elapsed_s": rows[-1]["elapsed_s"], "max_time_s": max_time,
                "sensor_bodies": ["l_funiculus", "r_funiculus"],
                "odor_length_mm": ODOR_LENGTH_MM, "relative_deadband": RELATIVE_DEADBAND,
                "sensor_period_s": 0.01,
                "arrival_rule": "thorax XY inside food radius; experiment terminates",
            }
            LOG.info("Navigation: %s at %.2f s", summary["navigation"]["status"], rows[-1]["elapsed_s"])
        (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        LOG.info("Saved %s (%d frames)", output.resolve(), frame_count)
        return summary
    finally:
        sim.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("smoke", "forward", "demo", "food", "odor"), default="demo")
    parser.add_argument("--food-xy", nargs=2, type=float, default=(14.0, 3.0),
                        metavar=("X", "Y"), help="Food center in mm (food/odor modes)")
    parser.add_argument("--max-time", type=float, default=6.0,
                        help="Odor search timeout in simulated seconds (0.01 to 30)")
    parser.add_argument("--output", type=Path, help="Output directory (default: outputs/MODE)")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--no-render", action="store_true", help="Physics and logs only")
    args = parser.parse_args()
    if not np.isfinite(args.food_xy).all():
        parser.error("--food-xy must contain finite coordinates")
    if not np.isfinite(args.max_time) or not 0.01 <= args.max_time <= 30:
        parser.error("--max-time must be between 0.01 and 30 seconds")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        run(args.mode, args.output or Path("outputs") / args.mode,
            seed=args.seed, render=not args.no_render, food_xy=args.food_xy, max_time=args.max_time)
    except KeyboardInterrupt:
        LOG.info("Interrupted; simulation resources closed.")
        raise SystemExit(130)


if __name__ == "__main__":
    main()
