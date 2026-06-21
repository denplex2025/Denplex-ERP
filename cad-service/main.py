"""
Denplex CAD Service — reads STEP files (free, OpenCASCADE via CadQuery), extracts
geometry and renders 2D projection views. Runs as a small standalone microservice
because OpenCASCADE is too heavy for the main Railway backend.

The ERP calls POST /analyze with {step_base64} and gets back geometry + view PNGs,
which it feeds (with the user's prompt) to the AI fixture generator.
"""
import base64
import os
import tempfile
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Denplex CAD Service", version="1.0")


class AnalyzeIn(BaseModel):
    step_base64: str
    views: int = 3


@app.get("/health")
def health():
    return {"ok": True, "service": "denplex-cad"}


@app.post("/analyze")
def analyze(inp: AnalyzeIn):
    import cadquery as cq
    from cadquery import exporters

    raw = base64.b64decode((inp.step_base64 or "").split(",")[-1])
    if not raw:
        raise HTTPException(400, "Empty STEP payload")
    tmp = tempfile.mkdtemp()
    sp = os.path.join(tmp, "part.step")
    with open(sp, "wb") as fh:
        fh.write(raw)

    try:
        wp = cq.importers.importStep(sp)
    except Exception as e:
        raise HTTPException(400, f"Could not read STEP: {e}")

    geom = {}
    try:
        solid = wp.val()
        bb = solid.BoundingBox()
        geom["bbox_mm"] = {"x": round(bb.xlen, 2), "y": round(bb.ylen, 2), "z": round(bb.zlen, 2)}
        try:
            geom["volume_cm3"] = round(solid.Volume() / 1000.0, 2)
        except Exception:
            pass
        planar = 0
        cyl = 0
        dias = []
        try:
            faces = solid.Faces()
        except Exception:
            faces = []
        for f in faces:
            try:
                gt = f.geomType()
            except Exception:
                gt = ""
            if gt == "PLANE":
                planar += 1
            elif gt == "CYLINDER":
                cyl += 1
                try:
                    dias.append(round(f.radius() * 2, 1))
                except Exception:
                    pass
        geom["planar_faces"] = planar
        geom["cylindrical_faces"] = cyl
        if dias:
            from collections import Counter
            geom["hole_or_round_diameters_mm"] = [d for d, _ in Counter(dias).most_common(12)]
    except Exception as e:
        geom["warning"] = f"geometry partial: {e}"

    # Tessellate to STL mesh for the in-ERP viewer (most reliable CadQuery export; no WASM in browser)
    mesh_b64 = ""
    mesh_fmt = ""
    try:
        meshp = os.path.join(tmp, "model.stl")
        cq.exporters.export(wp, meshp, tolerance=0.1, angularTolerance=0.2)
        with open(meshp, "rb") as fh:
            mesh_b64 = base64.b64encode(fh.read()).decode()
        mesh_fmt = "stl"
    except Exception:
        # fallback: try GLB
        try:
            asm = cq.Assembly(wp)
            glbp = os.path.join(tmp, "model.glb")
            asm.save(glbp)
            with open(glbp, "rb") as fh:
                mesh_b64 = base64.b64encode(fh.read()).decode()
            mesh_fmt = "glb"
        except Exception:
            mesh_b64 = ""; mesh_fmt = ""

    views = []
    try:
        import cairosvg
        plan = [((1, 1, 1), "iso"), ((0, 0, 1), "top"), ((1, 0, 0), "right")]
        for d, name in plan[:max(0, min(int(inp.views or 0), 3))]:
            svgp = os.path.join(tmp, f"{name}.svg")
            try:
                exporters.export(wp, svgp, exportType="SVG",
                                 opt={"width": 640, "height": 480, "projectionDir": d,
                                      "showAxes": False, "strokeWidth": 0.4})
                png = cairosvg.svg2png(url=svgp, output_width=640, output_height=480, background_color="white")
                views.append(base64.b64encode(png).decode())
            except Exception:
                pass
    except Exception:
        pass

    return {"ok": True, "geometry": geom, "views": views, "view_count": len(views),
            "mesh_base64": mesh_b64, "mesh_format": mesh_fmt}
