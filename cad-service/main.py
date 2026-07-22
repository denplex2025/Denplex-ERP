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
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Denplex CAD Service", version="1.0")


class AnalyzeIn(BaseModel):
    step_base64: str
    views: int = 3


def _render_views(wp, n, tmp):
    """Shared iso/top/right SVG->PNG rendering, used by /analyze and /fixture-build."""
    import cairosvg
    from cadquery import exporters
    views = []
    plan = [((1, 1, 1), "iso"), ((0, 0, 1), "top"), ((1, 0, 0), "right")]
    for d, name in plan[:max(0, min(int(n or 0), 3))]:
        svgp = os.path.join(tmp, f"{name}.svg")
        try:
            exporters.export(wp, svgp, exportType="SVG",
                             opt={"width": 640, "height": 480, "projectionDir": d,
                                  "showAxes": False, "strokeWidth": 0.4,
                                  # cadquery's SVG default marginLeft/marginTop (200/20) is sized for
                                  # width=None auto-fit mode; with explicit width+height it instead
                                  # shoves the model off-canvas for anything wider than it is tall.
                                  # Small, roughly-square margins keep the model centred either way.
                                  "marginLeft": 25, "marginTop": 25})
            png = cairosvg.svg2png(url=svgp, output_width=640, output_height=480, background_color="white")
            views.append(base64.b64encode(png).decode())
        except Exception:
            pass
    return views


# ---------------- Fixture concept -> real parametric CAD (Phase C) ----------------
# The AI fixture generator now emits a numeric "geometry" spec (base plate + posts + clamps
# + a simple part proxy) alongside its text brief. This turns that spec into an actual
# CadQuery solid and renders it the same way as a real STEP part, so the PDF gets a genuine
# 3D render of the PROPOSED FIXTURE instead of an AI hand-drawn SVG sketch. It's a simplified
# parametric approximation (box/cylinder primitives) — not as polished as a hand-modelled
# SolidWorks assembly, but real solid geometry with correct proportions and topology.

class CutoutIn(BaseModel):
    x_mm: float = 0
    y_mm: float = 0
    w_mm: float = 30
    h_mm: float = 30

class BasePlateIn(BaseModel):
    length_mm: float = 200
    width_mm: float = 120
    thickness_mm: float = 12
    cutouts: List[CutoutIn] = []

class PostIn(BaseModel):
    x_mm: float = 0
    y_mm: float = 0
    height_mm: float = 60
    width_mm: float = 20
    top: str = "v_groove"          # v_groove | flat | pin
    pin_diameter_mm: float = 8

class ClampIn(BaseModel):
    x_mm: float = 0
    y_mm: float = 0
    height_mm: float = 60

class PartProxyIn(BaseModel):
    type: str = "none"             # tube | block | none
    length_mm: float = 100
    diameter_mm: float = 20
    x_mm: float = 0
    y_mm: float = 0
    z_mm: float = 0
    axis: str = "x"                # x | y

class FixtureBuildIn(BaseModel):
    base_plate: BasePlateIn = BasePlateIn()
    posts: List[PostIn] = []
    clamps: List[ClampIn] = []
    part_proxy: Optional[PartProxyIn] = None
    views: int = 3


def _build_fixture_solid(spec: "FixtureBuildIn"):
    import cadquery as cq
    bp = spec.base_plate

    plate = (cq.Workplane("XY")
             .box(bp.length_mm, bp.width_mm, bp.thickness_mm)
             .translate((bp.length_mm / 2, bp.width_mm / 2, bp.thickness_mm / 2)))
    for c in (bp.cutouts or []):
        cutter = (cq.Workplane("XY")
                  .box(max(c.w_mm, 1), max(c.h_mm, 1), bp.thickness_mm + 4)
                  .translate((c.x_mm, c.y_mm, bp.thickness_mm / 2)))
        try:
            plate = plate.cut(cutter)
        except Exception:
            pass

    combined = plate
    for p in (spec.posts or []):
        w = max(p.width_mm, 6)
        h = max(p.height_mm, 10)
        post = (cq.Workplane("XY").box(w, w, h).translate((0, 0, h / 2)))
        if p.top == "v_groove":
            depth = w * 0.4
            pts = [(-w, h), (0, h - depth), (w, h)]
            try:
                tool = (cq.Workplane("XZ")
                        .polyline(pts).close()
                        .extrude(w * 2)
                        .translate((0, -w, 0)))
                post = post.cut(tool)
            except Exception:
                pass
        elif p.top == "pin":
            try:
                pin = (cq.Workplane("XY")
                       .circle(max(p.pin_diameter_mm, 2) / 2)
                       .extrude(h * 0.3)
                       .translate((0, 0, h)))
                post = post.union(pin)
            except Exception:
                pass
        post = post.translate((p.x_mm, p.y_mm, bp.thickness_mm))
        try:
            combined = combined.union(post)
        except Exception:
            pass

    for c in (spec.clamps or []):
        ch = max(c.height_mm, 20)
        try:
            base = cq.Workplane("XY").box(15, 15, ch).translate((0, 0, ch / 2))
            arm = cq.Workplane("XY").box(45, 12, 10).translate((22, 0, ch - 5))
            clamp = base.union(arm).translate((c.x_mm, c.y_mm, bp.thickness_mm))
            combined = combined.union(clamp)
        except Exception:
            pass

    pp = spec.part_proxy
    if pp and pp.type in ("tube", "block"):
        try:
            length = max(pp.length_mm, 10)
            dia = max(pp.diameter_mm, 4)
            if pp.type == "tube":
                proxy = cq.Workplane("YZ").circle(dia / 2).extrude(length)
                if pp.axis == "x":
                    proxy = proxy.rotate((0, 0, 0), (0, 1, 0), 90)
            else:
                if pp.axis == "x":
                    proxy = cq.Workplane("XY").box(length, dia, dia)
                else:
                    proxy = cq.Workplane("XY").box(dia, length, dia)
            proxy = proxy.translate((pp.x_mm, pp.y_mm, pp.z_mm))
            combined = combined.union(proxy)
        except Exception:
            pass

    return combined


@app.post("/fixture-build")
def fixture_build(spec: FixtureBuildIn):
    tmp = tempfile.mkdtemp()
    try:
        solid = _build_fixture_solid(spec)
    except Exception as e:
        raise HTTPException(400, f"Could not build fixture geometry: {e}")
    views = []
    try:
        views = _render_views(solid, spec.views, tmp)
    except Exception:
        views = []
    if not views:
        raise HTTPException(502, "Fixture geometry built but rendering failed (no views produced).")
    return {"ok": True, "views": views, "view_count": len(views)}


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

    try:
        views = _render_views(wp, inp.views, tmp)
    except Exception:
        views = []

    return {"ok": True, "geometry": geom, "views": views, "view_count": len(views),
            "mesh_base64": mesh_b64, "mesh_format": mesh_fmt}
