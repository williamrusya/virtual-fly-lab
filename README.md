# Virtual Fly Lab

[Open the browser experiment](https://williamrusya.github.io/virtual-fly-lab/)

Version 0.6 adds A/B sugar feeders, cue-specific memory bars, a visit chart and
a test phase with shocks/plasticity disabled. Swap feeder sides to probe cue
identity versus location. Counts describe this model, not measured fly behavior.

The browser version includes a reduced taste circuit: 447 simulated neurons and
24,403 directed connections from FlyWire v630, adapted from Shiu et al. (2024).
This circuit gates feeding at sugar contact; walking, attraction, pleasure,
stress and health remain illustrative application rules, not a complete brain.
Version 0.5 replaces scalar aversion memory with a separate 910-neuron rate
model of a FlyWire mushroom-body motif. KC->MBON synaptic efficacies change
under DAN modulation. Sensory encoding, numerical plasticity parameters and
behavioral decoding remain explicit assumptions, not a biologically validated
reproduction. See [learning methods](web/dist/data/LEARNING-NOTES.txt).
Source attribution and scientific limitations are in
[MODEL-NOTES](web/dist/data/MODEL-NOTES.txt).

## Website hosting

GitHub Pages serves `web/dist` without a backend. Each push to `main` runs the
browser tests and publishes the site using `.github/workflows/pages.yml`.
Visitors do not need an account or Python. State is local to each browser tab.
The Python simulation below is a separate local experiment.

## Interactive browser app

A standalone browser experiment is now available in `web/`: add food, apply
fictional electrical stimuli, and observe pleasure, stress, health, and death.
This uses a rendered NeuroMechFly sprite with simplified browser movement;
it does not run the Python/MuJoCo simulation below. See [web/README.md](web/README.md)
for the explicit fictional rules.

```powershell
cd web
node server.js
```

Open http://127.0.0.1:5173. Stop the local server with Ctrl+C.

## Python simulation

MVP 1–3: a local, physical NeuroMechFly locomotion experiment with a food source
and idealized bilateral odor sensing. In the original demo, one fly walks on
flat ground through MuJoCo, following **forward → left → forward → right → forward**.
The program saves a video and numerical telemetry, then closes its renderer.

This project uses the **FlyGym 2.1.0 API**. The installed implementation and the
[current composition tutorial](https://neuromechfly.org/tutorials/1a_basic_model_composition/)
and [turning tutorial](https://neuromechfly.org/tutorials/4d_turning_controller/)
were inspected before implementation. Legacy `flygym-gymnasium` examples are
incompatible with this project.

## Setup

Tested locally on Windows with Python **3.12.14**, FlyGym **2.1.0**, MuJoCo
**3.9.0**, and NumPy **2.5.3**. Use Python 3.12; `.python-version` selects the tested
patch version. `uv.lock` records the full dependency graph and package hashes.
The CPU simulation needs no CUDA. Rendering requires a working OpenGL driver.

With [uv](https://docs.astral.sh/uv/getting-started/installation/) installed, run
these commands in PowerShell from this directory:

```powershell
# From the root of your cloned repository:
uv sync --locked
```

This installs Python if needed, creates `.venv`, and installs the project and
FlyGym with its packaged NeuroMechFly assets. No separate NeuroMechFly checkout
or manual FFmpeg installation is needed. The default simplified meshes are
included in FlyGym. Environment activation is unnecessary with `uv run`.

## Run the three stages

```powershell
# 1. Instantiate, settle, simulate a standing fly, and render it.
uv run --locked virtual-fly-lab --mode smoke

# 2. Walk forward for one simulated second.
uv run --locked virtual-fly-lab --mode forward

# 3. Run the complete 2.6-second sequence.
uv run --locked virtual-fly-lab --mode demo

# View the complete demonstration in your default video player.
Start-Process .\outputs\demo\simulation.mp4
```

## MVP 2: food on the arena

```powershell
uv run --locked virtual-fly-lab --mode food
Start-Process .\outputs\food\simulation.mp4

# Move the food to another location (coordinates in millimetres).
uv run --locked virtual-fly-lab --mode food --food-xy 8 6 --output outputs/food-other
```

In `food` mode, a fixed overhead camera shows the fly and an orange food patch
at `(14, 3)` mm, with radius 1.5 mm. The fly walks forward for one simulated
second using the same controller as MVP 1. The camera automatically frames the
food location and the default walking area. The food patch is a visual marker
without collision, odor, consumption, or sensory input to the controller.
Its default position is deliberately near the known seed-0 path; arriving near
it is not autonomous food seeking. Moving it does not change the fly's commands.

`outputs/food/telemetry.csv` adds `food_distance_xy_mm` (horizontal distance from
the thorax to the patch center) and `inside_food_patch` (distance ≤ 1.5 mm).
This ignores height and mouth position; it measures proximity, not feeding.
`summary.json` includes food coordinates, radius, initial/final distance, minimum
sampled distance, and whether a sample entered the patch. Sampling remains at
0.01 seconds, so the minimum is not a continuous-time closest approach.
The video is 640×480 and approximately 10 seconds long at 0.1× playback speed.
In the verified seed-0 run, center distance decreased from 13.778 to 0.755 mm.

## MVP 3: follow the odor to food

```powershell
uv run --locked virtual-fly-lab --mode odor --food-xy 14 8
Start-Process .\outputs\odor\simulation.mp4

# Place food on the opposite side; the fly must choose a different route.
uv run --locked virtual-fly-lab --mode odor --food-xy 14 -8 --output outputs/odor-right

# Physics-only experiment with a bounded search time.
uv run --locked virtual-fly-lab --mode odor --no-render --max-time 3
```

In `odor` mode the fly chooses its commands repeatedly from the left/right odor
intensities, rather than replaying a prescribed route. The same physical leg
controller executes those commands. The overhead video plays at 0.2× speed.
The default source is `(14, 3)` mm when `--food-xy` is omitted.

FlyGym 2.1's installed `Simulation` does not expose the legacy olfaction API.
This project therefore adds a small explicit sensor model in `olfaction.py`,
using the current `get_body_positions()` API. Its two point sensors are located
at the simulated body origins of `l_funiculus` and `r_funiculus` (antennae).
These positions move with the physical fly. This is a project-defined idealized
sensor layer, not an upstream FlyGym receptor implementation. The
[current tutorials](https://neuromechfly.org/tutorials/index.html) distinguish the
new API from the legacy examples; no legacy odor classes are imported.

Model assumptions:

- The source generates a stationary radial field
  `C = exp(-horizontal_distance_mm / 10)`, with dimensionless intensity.
- There is no wind, turbulence, height dependence, sensory noise, receptor
  adaptation, or experimentally calibrated concentration scale. Maxillary palps
  are not modeled as sensors. Antennae are rigid in the legs-only body model.
- Every 0.01 simulated seconds, the controller compares
  `(left - right) / max(left + right, 1e-12)`. Above `+0.002` it turns left;
  below `-0.002` it turns right; inside that deadband it walks forward.
- Commands are held until the next sensor update; the leg controller and physics
  continue at 0.0001-second steps. Steering receives only the two intensities,
  not the source coordinates, target bearing, or distance.
- The experiment ends when the thorax's XY position enters the 1.5 mm food patch,
  or when `--max-time` expires (default 6 s, allowed range 0.01–30 s). Arrival is
  an external geometric evaluation, not a modeled feeding response or a
  sensor-driven stopping behavior. The simulation ends at arrival rather than
  simulating braking or feeding.

`telemetry.csv` adds `odor_left`, `odor_right`, `odor_sample_elapsed_s`, and
`antenna_positions_mm` (JSON, left then right, XYZ in mm). Odor columns describe
the input used to select the logged command, at the recorded sensor timestamp;
pose columns describe the later sampled physical state. `summary.json` adds
`navigation.status` (`reached` or `timeout`), elapsed time and model parameters.
A timeout is a completed experiment that did not reach food, not success.

Verified seed-0 cases: `(14, 8)` mm reached in 1.13 s with final distance 1.465 mm;
`(14, -8)` mm reached in 1.19 s with final distance 1.362 mm. These are short,
noise-free tests on flat ground, not a guarantee for arbitrary source positions
(especially behind the fly), seeds, or realistic odor plumes.

The default mode is `demo`. Video playback is slowed to 0.1× at 25 fps, so the
demonstration lasts approximately 26 seconds. Rendering is offscreen: the run
does not open an interactive viewer. The first run can take longer while Python
libraries initialize.

Each `outputs/<mode>/` directory contains:

- `simulation.mp4`: a camera follows the fly's position, keeping world orientation
  (`food` and `odor` instead use a fixed overhead camera).
- `telemetry.csv`: samples every 0.01 simulated seconds and at segment boundaries;
  elapsed time, absolute simulation time, command, thorax position in mm,
  quaternion `(w,x,y,z)`, yaw in radians, left/right drive, 42 joint targets in
  radians, and six adhesion states. Array-valued columns contain JSON.
- `summary.json`: versions, seed, timestep, joint ordering, and displacement and
  heading change for each segment.

The simulation clock includes 0.05 seconds of warmup; elapsed time starts after
warmup. Boundary rows share a timestamp and show the next descending command
with the most recently applied joint targets. Adhesion order is LF, LM, LH, RF,
RM, RH. Positive yaw denotes a left turn viewed from above; initial forward is
approximately world +X. Forward displacement is projected onto the heading at
the beginning of each segment.

For physics without OpenGL rendering, or a separate output directory:

```powershell
uv run --locked virtual-fly-lab --mode demo --no-render --output outputs/physics
uv run --locked virtual-fly-lab --mode demo --seed 0 --output outputs/repeat
```

Rerunning into the same directory overwrites that run's logs and video.
`--no-render` writes only logs; it does not remove an earlier video.
Ctrl+C exits with status 130 and closes the simulation. Other errors propagate
with a traceback after cleanup. A failed/interrupted run may leave partial logs.

## FlyGym-specific choices

`make_locomotion_fly()` from the packaged `flygym_demo.complex_terrain` module
constructs `flygym.compose.NeuroMechFly` with upstream locomotion settings:
42 position-actuated leg degrees of freedom, passive distal tarsal joints, and
foot adhesion. `FlatGroundWorld` supplies the arena; contact is enabled for
tibiae and tarsi. `Simulation` advances CPU MuJoCo physics at a 0.0001-second
timestep. `sim.close()` runs in `finally`, including on rendering/export errors.

`HybridTurningController` combines central pattern generators (CPGs), recorded
stepping trajectories, and retraction/stumbling corrections. Its observation is
read from the simulated body and ground contacts each tick. Its joint targets
and adhesion states are applied before stepping physics. There are no writes
to the fly's position to produce locomotion.

The three small command functions return dimensionless descending drives
`[left, right]`: `walk_forward()` returns `[1, 1]`, `turn_left()` returns
`[0.4, 1.2]`, and `turn_right()` returns `[1.2, 0.4]`. The controller converts
these into side-specific stepping amplitudes. These are curved walking turns,
not fixed-angle rotations or turns in place. A command function supplies the
drive; the simulation loop must keep applying it through the controller.

The neutral stepping pose and adhesion are applied before warmup. The CPG is
seeded once and stays continuous across command changes. Pose telemetry is
refreshed with `mujoco.mj_forward` after integration at sampling times so its
timestamps match the integrated state.

## Verification

```powershell
uv run --locked python -m unittest discover -s tests -v
```

These integration tests use real MuJoCo: a rendered standing simulation,
the full walking sequence, and two food locations. They check food distances
against recorded coordinates and verify that moving food leaves the trajectory
unchanged. They also check forward displacement, opposite turn signs,
finite states, thorax height, quaternion normalization, timestamps, and control
dimensions. The render test requires OpenGL, even though the locomotion test
itself runs without rendering.

Olfaction tests additionally check mirrored sensor responses, equal and absent
signals, concentration values, closed-loop arrival on both sides, logged sensor
positions and decisions, and a forced timeout that must not report success.

The local seed-0 demonstration produced 651 frames. Forward segments advanced
approximately 7.12, 8.04, and 8.26 mm along their starting headings. The left
segment changed yaw by +58.29°; the right segment by −47.45°. No MuJoCo warnings
were reported. Smoke, forward, and full demo videos were generated, and sampled
rendered frames were visually inspected.

## Limits and scope

Equal drive does not guarantee a perfectly straight trajectory. Gait asymmetry
and transient dynamics cause heading drift; turn angles are not calibrated.
These checks validate this short, flat-ground run, not arbitrary terrain or
long-duration stability. Floating-point results can vary across platforms.
The video renderer buffers frames in memory, appropriate for these short runs.

Python MVP 1–3 are implemented. The Python simulation has no visual obstacle
sensing or connectome model. The separate browser frontend has the reduced
taste circuit described above. Neither version has an experiment database.
The CPG is an upstream mathematical locomotion controller, not a reconstruction
of the fly's brain. Future work must distinguish anatomical connectivity,
assumed neural dynamics, sensory encoding, motor decoding, learned parameters,
and experimentally measured behavior. Anatomical connectivity alone is not a
complete digital copy of a living brain.
