"""Extract a reproducible induced subgraph from Shiu et al.'s FlyWire v630 data.

Run from repository root:
uv run --with pyarrow==23.0.1 python web/scripts/extract-taste-circuit.py
Source data is cached outside the published site; IDs stay strings for JS safety.
"""
import ast
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
import pyarrow.parquet as pq

COMMIT = "91bdd1e7dcf193f3e7ca5a8933497fcef63b7960"
BASE = f"https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/{COMMIT}/"
ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "research/shiu-model"
OUT = ROOT / "web/dist/data"
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
FILES = ["2023_03_23_completeness_630_final.csv", "2023_03_23_connectivity_630_final.parquet",
         "example.ipynb", "model.py", "LICENSE"]
EXPECTED_SHA256 = [
    "e6b71e17671a9bdb05f55e4bc6774640a1418cb7a05125e0fc994ad40f9bfdfb",
    "94db8c650533bc36ffa3223f2e62325d5648b8d6bd31c3a4e1c804628c7557b3",
    "1737c3043af700504c4791c4bfc02d1856bbeb0d36c469832e4b9399dfddda3a",
    "fc45837d7122c6ce2a7f3f2f23c515992e4b232aadb919efabb72337fac88e4e",
    "3621f6d6476189190e2960fa43f11b275ba4eca848fdac50a1ba2925de6223e8",
]
for name in FILES:
    if not (CACHE / name).exists():
        urlretrieve(BASE + name, CACHE / name)
for name, expected in zip(FILES, EXPECTED_SHA256):
    if hashlib.sha256((CACHE / name).read_bytes()).hexdigest() != expected:
        raise ValueError(f"Source checksum mismatch: {name}")
notebook = json.loads((CACHE / "example.ipynb").read_text())
for cell in notebook["cells"]:
    source = "".join(cell.get("source", []))
    if source.startswith("neu_sugar ="):
        input_ids = ast.literal_eval(source.split("=", 1)[1])
ids = np.loadtxt(CACHE / FILES[0], dtype=str, delimiter=",", skiprows=1, usecols=0)
lookup = {int(value):i for i,value in enumerate(ids)}
inputs = np.array([lookup[value] for value in input_ids])
output_id = 720575940660219265  # MN9, explicitly identified in the authors' example.
output = lookup[output_id]
table = pq.read_table(CACHE / FILES[1])
pre = table["Presynaptic_Index"].to_numpy()
post = table["Postsynaptic_Index"].to_numpy()

def distances(a, b, starts):
    distance = np.full(len(ids), 99)
    distance[starts] = 0
    for level in range(3):
        reached = np.unique(b[distance[a] == level])
        distance[reached[distance[reached] > level + 1]] = level + 1
    return distance

forward = distances(pre, post, inputs)
backward = distances(post, pre, [output])
selected = forward + backward <= 3
selected[inputs] = True
selected[output] = True
indices = np.flatnonzero(selected)
local = np.full(len(ids), -1)
local[indices] = np.arange(len(indices))
keep = selected[pre] & selected[post]
counts = table["Connectivity"].to_numpy()[keep]
signed = table["Excitatory x Connectivity"].to_numpy()[keep]
edges = np.column_stack([local[pre[keep]], local[post[keep]], counts, signed]).tolist()
data = {
    "format": 1,
    "source": {
        "paper": "https://doi.org/10.1038/s41586-024-07763-9",
        "repository": "https://github.com/philshiu/Drosophila_brain_model",
        "commit": COMMIT, "dataset": "FlyWire FAFB v630",
        "files": [{"name":name, "url":BASE+name,
                   "sha256":hashlib.sha256((CACHE/name).read_bytes()).hexdigest()} for name in FILES],
    },
    "selection": "All nodes on directed sugar-input-to-MN9 paths of <=3 edges, plus all 21 sugar inputs; all induced edges retained, including recurrent and inhibitory edges. External edges omitted.",
    "neurons": [{"id":str(ids[i]), "role":"sugar" if i in inputs else "MN9" if i == output else "network"} for i in indices],
    "inputs": local[inputs].tolist(), "output": int(local[output]),
    "edges": edges, "edge_columns": ["pre_index", "post_index", "synapse_count", "author_signed_count"],
    "parameters": {"dt_ms":0.1, "rest_mv":-52, "reset_mv":-52, "threshold_mv":-45,
                   "membrane_ms":20, "synapse_ms":5, "refractory_ms":2.2,
                   "delay_ms":1.8, "mv_per_synapse":0.275, "input_hz":150,
                   "input_mv":68.75},
}
(OUT / "taste-circuit.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
(OUT / "SHIU-LICENSE.txt").write_bytes((CACHE / "LICENSE").read_bytes())
print(f"Exported {len(indices)} neurons, {len(edges)} directed edges, {int(sum(counts))} anatomical synapses")
