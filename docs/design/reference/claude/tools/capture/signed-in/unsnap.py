#!/usr/bin/env python3
"""Write one snapshot from snapshot.js to <outdir>/<label>.html and <label>.json.

Usage: python3 unsnap.py <file holding the SNAPSTART...SNAPEND string> <outdir>
The input may be the raw string or a tool-result JSON array of {text} parts wrapping it.

Refuses the snapshot, writing nothing, if any pattern in the redaction file still matches or
any URL still carries a signing parameter. The redaction file names the learner, so it lives
outside the repository: $SNAP_REDACT, default ~/.self-learn/claude-redact.json, shaped like
redact.example.json beside this script.
"""
import json, os, pathlib, re, sys

src, outdir = sys.argv[1], sys.argv[2]
redact_path = pathlib.Path(os.environ.get("SNAP_REDACT", "~/.self-learn/claude-redact.json")).expanduser()
redact = json.loads(redact_path.read_text())

raw = open(src).read()
try:
    text = "".join(x.get("text", "") for x in json.loads(raw))
except Exception:
    text = raw
if text.startswith('"'):
    text = json.JSONDecoder().raw_decode(text)[0]
m = re.search(r"SNAPSTART(.*?)SNAPMETA(.*)SNAPEND", text, re.S)
meta, html = json.loads(m.group(1)), m.group(2)

leaks = []
for pattern, flags, _ in redact["replace"]:
    if re.search(pattern, html, re.I if "i" in flags else 0):
        leaks.append(f"redaction pattern {len(leaks) + 1}")
leaks += sorted(set(re.findall(r"[?&](?:amp;)?(X-Amz-Signature|X-Amz-Security-Token|Key-Pair-Id|Signature)=", html)))
if leaks:
    sys.exit(f"LEAK {leaks}")

os.makedirs(outdir, exist_ok=True)
open(f"{outdir}/{meta['label']}.html", "w").write(html)
json.dump(meta, open(f"{outdir}/{meta['label']}.json", "w"), indent=1)
print(meta["label"], len(html), meta)
