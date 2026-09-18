# Virtual Fly Lab — browser experiment

Standalone static web app in `dist/`, independent of the Python simulation.
Run `node server.js`, then open http://127.0.0.1:5173. Run checks with
`node --test tests/*.test.js`. No npm dependencies or build step are required.

## Controls

Add food with the button or by clicking/tapping the arena (up to five portions).
The fly approaches and eats it. Choose one of three pulse strengths, then apply
a fictional electric shock. Pause/resume or reset the experiment at any time.
Death is terminal until a reset; food cannot revive the fly. Each tab has its own
state in memory. Reloading starts fresh. A hidden browser tab suspends the
simulation without catching up on return.

Food is now shown as labeled sugar cubes. The fly is rendered in its own
positioned sprite layer, with a walking cycle captured after the CPG warmup,
a short movement trail, and a dashed line toward the current food target.
Food attraction takes precedence over exploratory boundary steering. Movement
speeds are 55/100/150 arena units per second for wandering/seeking/escape,
scaled by health. These are visual game units, not measured fly speeds.
The header now identifies the reduced FlyWire taste circuit. The body remains 2D.

## Connectome-derived taste circuit (v0.3)

The browser now runs 447 LIF neurons connected by 24,403 real directed edges
(218,932 anatomical synapses), extracted reproducibly from the FlyWire v630 data
distributed with Shiu et al. (Nature, 2024). See
[source, selection, dynamics and limitations](dist/data/MODEL-NOTES.txt).
The extraction script pins the upstream commit and records source checksums.
This reduced network is an adaptation, not the entire published brain model.

At contact with sugar, 21 input neurons receive stimulation. Eating requires
activity in MN9; the displayed counters are computed spikes, not animations or
recorded playback. Turn on "Отключить MN9": sensory neurons still fire but eating
is blocked. Turn it off to restore output. Data-load failure blocks the experiment
rather than silently reverting to fictional feeding.

The neural circuit gates feeding ONLY. Approaching sugar, walking, shock escape,
pleasure, stress, health and death remain explicit application rules. In
particular, the pleasure meter is not calculated from dopamine neurons.

## Explicit fictional assumptions

### Associative avoidance (v0.4)

Place sugar, wait for tasting/eating, then apply a weak shock. Shock immediately
interrupts feeding and causes escape. A shock at sugar contact or within 1.5
simulated seconds of the last contact increases a scalar aversion memory.
Offer more sugar: at memory >=35/100 the fly avoids it, even after stress fades.
Unpaired shocks away from sugar do not teach the association. Memory generalizes
to all sugar, halves every 90 simulated seconds and pauses with the experiment.
Use the memory-reset button to compare behavior without resetting health/stress.

This is an explicitly invented learning rule, not plasticity in the FlyWire
circuit or a reproduction of biological conditioning. Real connection weights
remain unchanged. Contact still excites the taste circuit, but aversion gates
the behavioral readout. Exact parameters are in `dist/data/MODEL-NOTES.txt`.
Tests compare paired vs unpaired stimuli, delayed stimuli, interruption/escape,
retention beyond stress, forgetting, reset and feeding recovery, including the
actual UI handlers in the DOM harness.

These values are game rules, not measured biology or a model of neurotransmitters:

- Pleasure is labeled an **illustrative dopamine index** (0–100), not an assay
  or a claim that dopamine equals pleasure biologically. Initial value 18;
  decay 0.75 points per simulated second.
- Eating one portion adds 32 pleasure, removes 14 stress, and restores 4 health.
  Placing food alone does not give a reward.
- A pulse of strength 1/2/3 adds 22/44/66 stress, removes 11/22/33 health and
  12/24/36 pleasure. There is a 0.7-second pulse cooldown and 1.1-second escape.
- Stress decays 1.8 points per second. Above 70 it causes additional health loss
  of `(stress - 70) × 0.2` points per second. At zero health the fly dies.
- Movement is a 2D browser model with attraction to food and boundary steering.
  Movement itself is not driven by MuJoCo, FlyGym olfaction, a neural circuit, or an
  electrical/biophysical injury model. The controls never operate real hardware.

The transparent walking animation was rendered from the installed FlyGym 2.1.0
NeuroMechFly model using `scripts/render-fly.py`. Regenerate from the parent
Python workspace with `uv run --locked python web/scripts/render-fly.py`.
The actual asset is included so the hosted app needs neither Python nor MuJoCo.
NeuroMechFly project and attribution: https://neuromechfly.org/;
FlyGym source: https://github.com/NeLy-EPFL/flygym (Apache-2.0).

Google Fonts is optional; a system font is used if unavailable. No analytics,
backend, accounts, personal-data collection, or remote experiment storage.

## Validation

Model tests cover food, pulse strengths/cooldown, stress damage, terminal death,
pause, reset, caps, and timing. Static asset routes and JS syntax are checked
before publication. Browser visual/interaction QA was not requested. Optional
WebMCP tools `read_fly_state` and `apply_fly_action` use the same state and actions;
unsupported browsers simply skip registration. A supported WebMCP validation
context was unavailable, so those optional tool contracts are not browser-verified.

The additional application-loop regression test executes the actual `app.js`
against a small DOM/canvas harness, checking that advancing animation frames
moves the visible sprite as well as the timer, and that the feed button leads
to consumption. This is not a real-browser visual check. Edge/behind-target
tests verify that all supported sugar locations remain reachable.

Neural tests add baseline/stimulated behavior, MN9 silencing, graph-disconnection
controls, contact-to-consumption causality, numerical timing invariance, passive
decay, and data integrity checks. They do not validate the model against biology.
