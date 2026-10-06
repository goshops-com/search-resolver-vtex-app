"""Probes the linked app every ~2s to measure the effect of `vtex link` restarts.

    VTEX_ID_TOKEN=... python3 docs/perf/restart_probe.py <seconds> > client.jsonl

Each line has the request start (epoch), its duration and whether it failed.
The resolver logs of the same requests carry `perfRun` = probe-<i>, plus the
worker bootId/requestNumber, so restarts show up as a new bootId.
"""
import json
import os
import sys
import time
import urllib.request

TOKEN = os.environ["VTEX_ID_TOKEN"]
URL = "https://buscador--coolboxpe.myvtex.com/_v/segment/graphql/v1"
QUERY = 'query{facets(fullText:"monitor",hideUnavailableItems:true) @context(provider:"vtex.search-graphql"){recordsFiltered}}'

end = time.time() + int(sys.argv[1])
i = 0
while time.time() < end:
    i += 1
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": QUERY}).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "curl/8",
            "x-perf-run": f"probe-{i}",
            "Cookie": f"VtexIdclientAutCookie={TOKEN}",
        },
    )
    started = time.time()
    err = None
    n = None
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=30).read())
        n = ((data.get("data") or {}).get("facets") or {}).get("recordsFiltered")
        if data.get("errors"):
            err = data["errors"][0].get("message", "")[:80]
    except Exception as e:  # noqa: BLE001 - every failure is a data point
        err = str(e)[:80]
    print(json.dumps({"i": i, "t0": round(started, 3), "dur": round(time.time() - started, 3), "n": n, "err": err}), flush=True)
    time.sleep(2)
