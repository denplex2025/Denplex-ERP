# Denplex Machining-Quote Service

A standalone microservice that reads **STEP** files using **FreeCAD's Part module** (free, LGPL),
detects real geometry (bounding box, volume, hole diameters via cylindrical-face detection), and
applies industry-standard machining formulas (material removal rate for roughing, feed/speed/depth
for drilling, feed/perimeter for profile finishing) to produce a cycle-time and cost estimate.

**This does not generate or simulate G-code toolpaths.** Two reasons: FreeCAD's Path Workbench
scripting API isn't stable across versions and can't be tested before deploy (no local FreeCAD in
the dev sandbox), and it isn't actually how CNC quoting tools work anyway — commercial quoting
platforms compute time from geometry + machining-rate formulas too, because toolpath generation is
for programming a machine, not costing a job. Every number the service returns is a named, tunable
assumption (see `assumptions` in the response), not a black box.

Runs **separately** from the main ERP backend and from `cad-service` — FreeCAD is a much heavier
dependency than CadQuery, and there's no pip wheel for it, so it needs its own apt-based Docker
image (see Dockerfile comments for why it's based on `ubuntu:22.04` specifically).

## Endpoints
- `GET /health` → `{ "ok": true, "service": "denplex-machining-quote" }`
- `POST /quote` body:
  ```json
  {
    "step_base64": "<base64 of a .step file>",
    "stock_margin_mm": 3,
    "machine": { "axes": 3, "travel_x_mm": 300, "travel_y_mm": 300, "travel_z_mm": 200, "rapid_feed_mm_min": 10000 },
    "material": { "vc_mill": 90, "vc_drill": 25, "fz_mill": 0.08, "f_drill": 0.15, "density": 7.85 },
    "tool": { "mill_diameter_mm": 10, "flutes": 4 },
    "hourly_rate": 800
  }
  ```
  → `{ "ok": true, "geometry": {...}, "holes": [...], "time_breakdown_min": {...}, "cost": ..., "warnings": [...], "assumptions": [...] }`

The main ERP backend owns the Machine master and the material cutting-parameter table
(`MATERIAL_CUTTING_PARAMS` in `server.py`) and builds this payload — this service is deliberately
"dumb" about business data so it never needs a redeploy when a machine or material profile changes.

## Deploy on Railway (one-time)
1. In your Railway project, **New → Deploy from GitHub repo** (or "Empty Service").
2. Point it at this `machining-service/` folder (set **Root Directory = machining-service**).
   Railway auto-detects the **Dockerfile** and builds it.
   - **Watch the build log closely on the first deploy.** The Dockerfile has a build-time sanity
     check (`RUN python3 -c "import Part; ..."`) that will fail the BUILD itself (not just a
     request later) if FreeCAD's Part module isn't importable — that failure is the single most
     likely first-deploy problem, since this was never testable locally.
3. Once it's live, copy the service's public URL.
4. In your **main ERP backend** service → Variables, add:
   `MACHINING_SERVICE_URL = https://<this-service>.up.railway.app`
5. Redeploy the ERP backend. The Machining Quote page (Production → Machining Quote) will now
   send STEP uploads here.

## If the build-time `import Part` check fails
This means the `freecad-python3` apt package (Ubuntu 22.04) didn't install in a way that's
importable from plain `python3`. Options to try, in order: (a) check Railway's build log for the
apt install step's actual output — package names/versions can differ between Railway's build
environment and the dev sandbox this was written against; (b) try invoking FreeCAD via the
`freecadcmd` binary as a subprocess instead of a direct `import Part` (more portable, since
`freecadcmd` bundles its own path setup, but adds subprocess/serialization complexity to `main.py`);
(c) as a last resort, ubuntu:22.04's `freecad` package name/version may have shifted — `apt list -a
freecad freecad-python3` on the built image (via Railway shell) will show what's actually available.

## Notes
- STEP only. No native SolidWorks `.SLDPRT`/`.SLDASM` support (same limitation as `cad-service` —
  use the SolidWorks→STEP export macros in `sw-bridge/` first).
- If `MACHINING_SERVICE_URL` is not set, the ERP's `/machining/quote` endpoint returns a clear 503
  rather than failing silently.
- Hole-depth estimation and the roughing/facing/profile formulas are heuristics tuned for typical
  small-job-shop prismatic parts (brackets, plates) — not exact for complex freeform geometry.
