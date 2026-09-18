"""Extract a left alpha2/alpha3 KC-MBON/PPL1 motif; no invented anatomical edges.
Run: uv run --with pyarrow==23.0.1 python web/scripts/extract-learning-circuit.py
"""
import csv
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'research'
CACHE.mkdir(exist_ok=True)
ANNOT_COMMIT = 'df6bb136f5b3d91c3992df4e8de2642329e2a384'
ANNOT_URL = f'https://raw.githubusercontent.com/flyconnectome/flywire_annotations/{ANNOT_COMMIT}/supplemental_files/Supplemental_file1_annotations.tsv'
CONNECT_COMMIT = '91bdd1e7dcf193f3e7ca5a8933497fcef63b7960'
CONNECT_URL = f'https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/{CONNECT_COMMIT}/2023_03_23_connectivity_630_final.parquet'
sources = [
    (CACHE / 'annotations-v630.tsv', ANNOT_URL, '55c99c61eecf8db6cc36f1a684b35e4c4208afbab02197d753ccc8dc2a6e2e76'),
    (CACHE / 'shiu-model/2023_03_23_connectivity_630_final.parquet', CONNECT_URL, '94db8c650533bc36ffa3223f2e62325d5648b8d6bd31c3a4e1c804628c7557b3'),
]
for path, url, sha in sources:
    path.parent.mkdir(exist_ok=True)
    if not path.exists():
        urlretrieve(url, path)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sha, f'Checksum mismatch: {path.name}'
with sources[0][0].open(encoding='utf-8') as f:
    rows = list(csv.DictReader(f, delimiter='\t'))
types = {'MBON18': ('MBON', 'alpha2'), 'MBON14': ('MBON', 'alpha3'),
         'PPL105': ('DAN', 'alpha2'), 'PPL106': ('DAN', 'alpha3')}
annotations = {}
for r in rows:
    t = r['hemibrain_type']
    if r['side'] != 'left':
        continue
    if t.startswith('KCab') or t in types:
        role, compartment = ('KC', 'alpha2+alpha3') if t.startswith('KCab') else types[t]
        annotations[int(r['root_id'])] = {'id': r['root_id'], 'type': t, 'role': role,
                                         'compartment': compartment, 'side': r['side'], 'transmitter': r['top_nt']}
table = pq.read_table(sources[1][0])
print('Columns:', table.column_names)
pre = table['Presynaptic_ID'].to_numpy()
post = table['Postsynaptic_ID'].to_numpy()
count = table['Connectivity'].to_numpy()
candidate_ids = np.array(list(annotations), dtype=np.int64)
mask = np.isin(pre, candidate_ids) & np.isin(post, candidate_ids)
selected_edges = []
for a, b, n in zip(pre[mask], post[mask], count[mask]):
    aa, bb = annotations[int(a)], annotations[int(b)]
    # Only feedforward KC->MBON and the anatomical DAN projection evidence.
    if (aa['role'] == 'KC' and bb['role'] == 'MBON') or (aa['role'] == 'DAN' and bb['role'] in ('KC', 'MBON')):
        selected_edges.append((int(a), int(b), int(n)))
used_kcs = {a for a, b, n in selected_edges if annotations[a]['role'] == 'KC'}
neurons = [v for k, v in sorted(annotations.items()) if k in used_kcs or v['role'] != 'KC']
lookup = {int(v['id']): i for i, v in enumerate(neurons)}
edges = [[lookup[a], lookup[b], n] for a, b, n in selected_edges if a in lookup and b in lookup]
data = {'format': 1, 'dataset': 'FlyWire FAFB v630',
        'sources': [{'url': url, 'sha256': sha} for _, url, sha in sources],
        'selection': 'Left KCab neurons with edges to MBON18/MBON14, plus PPL105/PPL106; KC->MBON and DAN->KC/MBON edges only. Other edges omitted.',
        'neurons': neurons, 'edges': edges, 'edge_columns': ['pre_index', 'post_index', 'anatomical_synapse_count'],
        'compartment_mapping_source': 'https://elifesciences.org/articles/62576',
        'parameters': {'dt_s': .005, 'kc_tau_s': .05, 'dan_tau_s': .1, 'mbon_tau_s': .08,
                       'eligibility_tau_s': 1.5, 'learning_rate_per_s': 4, 'minimum_efficacy': .05,
                       'reinforcement_duration_s': .4, 'avoidance_threshold': .35},
        'assumptions': 'Rate neurons; synthetic sparse cue->KC drive; direct PPL1 stimulation for shock; compartment-matched multiplicative LTD; no fitted biophysical parameters or verified sugar/shock sensory pathways.'}
out = ROOT / 'web/dist/data/learning-circuit.json'
out.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'neurons': len(neurons), 'roles': {role: sum(n['role'] == role for n in neurons) for role in ['KC', 'MBON', 'DAN']},
                  'edges': len(edges), 'plastic_edges': sum(neurons[a]['role'] == 'KC' for a,b,n in edges),
                  'synapses': sum(e[2] for e in edges)}))
