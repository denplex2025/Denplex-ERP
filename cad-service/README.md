# Denplex CAD Service (Phase A — STEP geometry reader)

A small standalone microservice that reads **STEP** files using **CadQuery / OpenCASCADE**
(free, LGPL — no licence fees), extracts geometry (bounding box, volume, planar/cylindrical
faces, round/hole diameters) and renders 2D projection views (iso / top / right) as PNGs.

It runs **separately** from the main ERP backend because OpenCASCADE is too heavy to build on
the main Railway service. The ERP calls it over HTTP.

## Endpoints
- `GET /health` → `{ "ok": true }`
- `POST /analyze` body `{ "step_base64": "<base64 of a .step file>", "views": 3 }`
  → `{ "ok": true, "geometry": {...}, "views": ["<base64 png>", ...] }`

## Deploy on Railway (recommended — one-time)
1. In your Railway project, **New → Deploy from GitHub repo** (or "Empty Service").
2. Point it at this `cad-service/` folder (set **Root Directory = cad-service** if the repo
   has other folders). Railway auto-detects the **Dockerfile** and builds it.
   - First build is slow (CadQuery/OpenCASCADE is large) — that's expected, ~5–10 min.
3. Once it's live, copy the service's public URL (e.g. `https://denplex-cad-production.up.railway.app`).
4. In your **main ERP backend** service → Variables, add:
   `CAD_SERVICE_URL = https://denplex-cad-production.up.railway.app`
5. Redeploy the ERP backend. Now uploading a `.step` file in the AI Fixture Concept page will
   send it here for real geometry + rendered views.

## Alternatives to Railway
- **Render.com** / **Fly.io** — both deploy a Dockerfile the same way. Free/cheap tiers work
  (the service is only called on demand).
- A small VM (1–2 GB RAM) running `docker build` + `docker run -p 8000:8000`.

## Notes
- STEP only (Phase A). Native SolidWorks `.SLDPRT` / `.SLDASM` need Phase B (the SolidWorks-side
  bridge that exports STEP using your existing licence).
- If `CAD_SERVICE_URL` is not set, the ERP still works — it just falls back to the drawing/photo
  + STL bounding-box flow.
