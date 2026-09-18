"""Render a reusable transparent sprite strip from the existing NeuroMechFly model."""
from pathlib import Path
import mujoco
import numpy as np
from PIL import Image
from flygym import Simulation
from flygym.compose import FlatGroundWorld
from flygym.anatomy import ContactBodiesPreset
from flygym.utils.math import Rotation3D
from flygym_demo.complex_terrain import (
    make_locomotion_fly, PreprogrammedSteps, HybridTurningController,
    HybridControllerObservation, LocomotionAction, apply_locomotion_action,
)

fly = make_locomotion_fly(name="fly", colorize=True)
cam = fly.add_tracking_camera(name="sprite", pos_offset=(-0.7, 0, 8.5),
                              rotation=Rotation3D("quat", [1, 0, 0, 0]), fovy=45)
world = FlatGroundWorld()
world.add_fly(fly, [0, 0, 0.8], Rotation3D("quat", [1, 0, 0, 0]),
              bodysegs_with_ground_contact=ContactBodiesPreset.TIBIA_TARSUS_ONLY,
              add_ground_contact_sensors=False)
sim = Simulation(world)
renderer = None
try:
    steps = PreprogrammedSteps()
    dofs = fly.get_actuated_jointdofs_order("position")
    apply_locomotion_action(sim, fly.name, LocomotionAction(
        steps.default_pose_by_dof_order(dofs), np.ones(6, dtype=bool)))
    sim.warmup()
    controller = HybridTurningController(timestep=sim.timestep,
        preprogrammed_steps=steps, output_dof_order=dofs)
    controller.reset(seed=0)
    # Capture established walking, not the initial almost-static CPG ramp-up.
    for _ in range(2000):
        obs = HybridControllerObservation.from_sim(sim, fly.name)
        apply_locomotion_action(sim, fly.name, controller.step(np.ones(2), obs))
        sim.step()
    renderer = mujoco.Renderer(sim.mj_model, height=256, width=256)
    strip = Image.new("RGBA", (256 * 12, 256))
    for frame in range(12):
        for _ in range(70):
            obs = HybridControllerObservation.from_sim(sim, fly.name)
            apply_locomotion_action(sim, fly.name, controller.step(np.ones(2), obs))
            sim.step()
        mujoco.mj_forward(sim.mj_model, sim.mj_data)
        renderer.update_scene(sim.mj_data, camera=cam.name)
        rgb = renderer.render().copy()
        renderer.enable_segmentation_rendering()
        segmentation = renderer.render().copy()
        renderer.disable_segmentation_rendering()
        ids = segmentation[:, :, 0]
        valid = (segmentation[:, :, 1] == mujoco.mjtObj.mjOBJ_GEOM) & (ids >= 0)
        mask = valid & (sim.mj_model.geom_bodyid[np.maximum(ids, 0)] != 0)
        rgba = np.dstack((rgb, mask.astype(np.uint8) * 255))
        strip.paste(Image.fromarray(rgba), (frame * 256, 0))
    output = Path(__file__).resolve().parents[1] / "dist/assets/fly-walk.png"
    strip.save(output)
    print(output)
finally:
    if renderer:
        renderer.close()
    sim.close()
