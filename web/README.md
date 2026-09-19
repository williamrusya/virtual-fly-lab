# Virtual Fly Lab — browser experiment

Standalone static web app in `dist/`, independent of the Python simulation.
Run `node server.js`, then open http://127.0.0.1:5173. Run checks with
`node --test tests/*.test.js`. No npm dependencies or build step are required.

## Controls

### Two feeders and visit chart (v0.6)

Use "Установить кормушки A + B" to replace loose sugar with two persistent
feeders at (220,310) and (680,310). Both offer identical sugar. A drives cue 0
and B drives cue 1: distinct synthetic ensembles of 90 KCs in the same learning
network. Punish near either feeder; no cue is preassigned safe or dangerous.
The two memory bars report depression separately for the A and B connections.

"Проверить без тока" recenters the fly, refills feeders and starts a new test
count. It preserves weights, health and stress, clears learning activity/traces
and pending reinforcement, and blocks shocks and plasticity during the test.
The side-swap checkbox moves the cue identity with its feeder. Repeating the
test clears its previous counts; installing the pair clears both chart phases
but preserves weights. Full reset returns to loose-sugar mode and clears all.

The chart counts entries within 40 arena units of an available feeder, with a
65-unit exit requirement before recounting. Visits are not ingestion events.
After eating, a feeder is unavailable for 8 simulated seconds, then refills.
The goal selector maintains its selected feeder and switches to the other cue
if the current sensory response indicates learned avoidance. This motor decision
rule is an application assumption. It does not directly inspect synaptic weights.

Bars have a shared count scale. Percentages refer to test visits only, with no
percentage shown for zero visits. These are observations of one deterministic
model, not independent biological trials or estimated probabilities. Phase
durations, geometry, tie-breaking, health, stress and refill timing affect counts.
Tests cover naive visits to both, learning either cue, swapping sides, exact
weight preservation during tests, hysteresis, reset and UI control behavior.

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

### Synaptic learning (v0.5)

The scalar aversion variable from v0.4 has been removed. A separate rate model
now runs on an extracted FlyWire v630 left alpha2/alpha3 motif: 905 Kenyon cells,
2 PPL1 DANs and 3 MBONs. Memory consists of individual efficacy multipliers on
2,575 real KC->MBON connections; anatomical counts remain immutable.
KC eligibility and compartment-matched DAN activity cause synaptic depression.
The changed MBON response controls avoidance through an explicitly assumed decoder.

Place sugar, apply a weak shock while the fly approaches or contacts it, then
offer another portion. Inspect KC activity, PPL1 activity, MBON output relative
to the counterfactual naive response, and the changed-connection count.
For causal controls, restore weights and block plasticity or silence PPL1 before
training. Existing memory survives either block. Weights persist until reset or
reload; automatic forgetting is no longer modeled. Each tab is independent.

**Biologically motivated does not mean biologically validated.** KC cue encoding
and the shock-to-PPL1 mapping are synthetic; no verified sensory pathway joins
the taste and learning modules. Rate dynamics and plasticity parameters are
chosen for this demonstration, not fitted experimental measurements. The taste
memory study used bitter reinforcement/direct DAN stimulation, not our virtual
shock protocol. Full methods, source hashes, citations and limitations are in
[LEARNING-NOTES](dist/data/LEARNING-NOTES.txt).

Extraction: `uv run --with pyarrow==23.0.1 python web/scripts/extract-learning-circuit.py`
(from the repository root). Source caches stay in ignored `research/`.

### Health and movement
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

### Predator mode (v0.7)

The two predator start buttons reset the experiment to the same initial state,
with plasticity enabled or frozen. A third disjoint synthetic group of 90 KCs
encodes web proximity. Capture supplies a PPL1 pulse through the existing learning
model. MBON avoidance drives a chosen tangent/outward steering rule. Sugar cues
A/B, anatomical counts and the taste circuit are unchanged.

The web grows from radius 55 to 95 at 3 arena units/s. Both groups have the same
innate escape: after 0.8 s, outward speed is 32/capture-count units/s. The predator
approaches at 35 units/s and kills on contact within 17 units. These arbitrary
mechanics, proximity sensing and synthetic reinforcement are not reconstructed
FlyWire pathways or validated biological behavior. Repeated captures exhaust
escape by design. No randomness or population-level inference is involved.

Compare captures, escapes and sugar consumption at equal elapsed simulation time.
The UI retains the previous trial summary when starting the other condition.
Relocating the web preserves learned weights but changes geometry; compare that
protocol separately. Tests cover matched trials, cue specificity, fatal capture,
pause/death, relocation, controls and frame segmentation. Canvas drawing and
controls are exercised in a DOM harness, not a real-browser visual inspection.

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
