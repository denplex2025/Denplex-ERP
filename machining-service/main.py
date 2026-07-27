"""
Denplex Machining-Quote Service — reads STEP files via FreeCAD's Part module (independent of
cad-service's CadQuery pipeline; runs as its own microservice because FreeCAD is a much heavier,
separate dependency), detects real geometry (bounding box, volume, hole diameters via cylindrical
face detection), and applies industry-standard machining-time formulas (material removal rate for
roughing, feed/speed/depth for drilling, feed/perimeter for profile finishing) to produce a
cost/time estimate.

This deliberately does NOT script FreeCAD's Path Workbench to generate literal G-code toolpaths.
Two reasons: (1) Path Workbench's scripting API is not stable across FreeCAD versions and this
service can't be tested locally before deploy, so getting it wrong would mean debugging blind
through redeploy cycles; (2) it's not actually how CNC quoting tools work anyway — they compute
time from geometry + machining-rate formulas, because full toolpath generation is for programming
a machine, not costing a job. Every number below is a named, tunable assumption returned in the
response so the shop can see exactly what drove the estimate.

Input geometry + machining parameters come from the main ERP backend (which owns the Machine
master and MATERIAL_CUTTING_PARAMS table) — this service is intentionally "dumb" about business
data so it never needs a redeploy when a material or machine profile changes.
"""
import base64
import math
import os
import tempfile
from collections import Counter
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Denplex Machining-Quote Service", version="1.0")


# ---------------- Request/response models ----------------
class MachineIn(BaseModel):
    axes: int = 3
    travel_x_mm: float = 0
    travel_y_mm: float = 0
    travel_z_mm: float = 0
    turning_dia_mm: float = 0
    turning_length_mm: float = 0
    rapid_feed_mm_min: float = 10000


class MaterialIn(BaseModel):
    vc_mill: float = 90        # m/min, milling cutting speed
    vc_drill: float = 25       # m/min, drilling cutting speed
    fz_mill: float = 0.08      # mm/tooth, milling feed per tooth
    f_drill: float = 0.15      # mm/rev, drilling feed per revolution
    density: float = 7.85      # g/cm3


class ToolIn(BaseModel):
    mill_diameter_mm: float = 10
    flutes: int = 4
    stepover_pct: float = 40       # ae as % of tool diameter
    doc_pct: float = 50            # ap (depth of cut) as % of tool diameter
    roughing_efficiency: float = 0.55   # accounts for air moves/retracts/re-engage not captured by pure MRR math
    finishing_feed_factor: float = 0.5  # finish passes run slower than roughing feed


class QuoteIn(BaseModel):
    step_base64: str
    stock_margin_mm: float = 3
    machine: MachineIn = MachineIn()
    material: MaterialIn = MaterialIn()
    tool: ToolIn = ToolIn()
    setup_minutes_per_fixturing: float = 25
    hourly_rate: float = 0


def _read_step_shape(path: str):
    """Read a STEP file into a FreeCAD Part.Shape. Uses the Part module's own file reader —
    the most stable, longest-standing geometry-import API in FreeCAD (unchanged across
    0.19 -> 1.0), independent of the Path Workbench scripting concerns noted above."""
    import Part
    shape = Part.Shape()
    shape.read(path)
    return shape


def _detect_holes(shape) -> List[dict]:
    """Group cylindrical faces by (rounded) diameter and estimate each hole's axial depth from
    the face's own bounding box extent along its axis. Heuristic, not exact feature recognition
    (won't distinguish a real blind hole from a boss/round of the same diameter), but a reasonable
    approximation for typical prismatic brackets/plates."""
    dias = []
    face_depth_by_dia = {}
    for f in shape.Faces:
        try:
            surf = f.Surface
            if surf.__class__.__name__ != "Cylinder":
                continue
            radius = surf.Radius
            dia = round(radius * 2, 1)
            bb = f.BoundBox
            depth = max(bb.XLength, bb.YLength, bb.ZLength)
            dias.append(dia)
            face_depth_by_dia.setdefault(dia, []).append(depth)
        except Exception:
            continue
    counts = Counter(dias)
    holes = []
    for dia, count in counts.most_common(20):
        depths = face_depth_by_dia.get(dia, [10.0])
        holes.append({
            "diameter_mm": dia,
            "count": count,
            "est_depth_mm": round(max(depths), 2),
        })
    return holes


def _analyze(step_bytes: bytes) -> dict:
    # FreeCAD must be imported before Part: Part's Python types inherit from FreeCAD's own base
    # types (App::DocumentObject etc.), and importing Part first crashes with a hard segfault
    # (PyType_Ready() on a subtype whose base type pointer is still NULL) rather than a catchable
    # Python error. Reproduced and root-caused locally (gdb backtrace showed a null-pointer type
    # check inside Part.so's module init) after two blind Railway deploys mis-attributed this to
    # a headless-display/Coin3D issue. Importing FreeCAD once here (before Part, and before the
    # try/except below) is the actual fix — no xvfb or virtual display needed at all.
    import FreeCAD  # noqa: F401
    import Part  # noqa: F401  (import here so a missing FreeCAD install fails inside the try/except below, not at module load)

    tmp = tempfile.mkdtemp()
    sp = os.path.join(tmp, "part.step")
    with open(sp, "wb") as fh:
        fh.write(step_bytes)

    shape = _read_step_shape(sp)
    bb = shape.BoundBox
    geometry = {
        "bbox_mm": {"x": round(bb.XLength, 2), "y": round(bb.YLength, 2), "z": round(bb.ZLength, 2)},
        "volume_cm3": round(shape.Volume / 1000.0, 2),
        "surface_area_cm2": round(shape.Area / 100.0, 2),
    }
    holes = _detect_holes(shape)
    return {"geometry": geometry, "holes": holes}


def _time_breakdown(geom: dict, holes: List[dict], inp: QuoteIn) -> dict:
    bbox = geom["bbox_mm"]
    part_volume_cm3 = geom["volume_cm3"]
    margin = max(inp.stock_margin_mm, 0)
    stock_x = bbox["x"] + 2 * margin
    stock_y = bbox["y"] + 2 * margin
    stock_z = bbox["z"] + 2 * margin
    stock_volume_cm3 = (stock_x * stock_y * stock_z) / 1000.0
    volume_to_remove_cm3 = max(stock_volume_cm3 - part_volume_cm3, 0.01)

    tool = inp.tool
    mat = inp.material
    d = max(tool.mill_diameter_mm, 0.5)
    rpm_mill = (1000.0 * mat.vc_mill) / (math.pi * d)
    vf_mill = mat.fz_mill * max(tool.flutes, 1) * rpm_mill         # mm/min, roughing feed
    ap = d * (tool.doc_pct / 100.0)                                # depth of cut, mm
    ae = d * (tool.stepover_pct / 100.0)                           # stepover, mm
    mrr_cm3_min = max((ap * ae * vf_mill) / 1000.0, 0.001)
    roughing_time_min = (volume_to_remove_cm3 / mrr_cm3_min) / max(tool.roughing_efficiency, 0.05)

    # Facing: one pass across the stock's top footprint at the roughing stepover/feed.
    top_area_mm2 = stock_x * stock_y
    facing_time_min = top_area_mm2 / (ae * vf_mill) if ae > 0 and vf_mill > 0 else 0

    # Outer profile finish: one pass around the part's XY perimeter at a slower finishing feed.
    perimeter_mm = 2 * (bbox["x"] + bbox["y"])
    vf_finish = vf_mill * max(tool.finishing_feed_factor, 0.05)
    profile_time_min = perimeter_mm / vf_finish if vf_finish > 0 else 0

    # Drilling: per detected hole diameter, standard feed = f_drill * rpm; depth = detected axial
    # extent + a fixed approach/retract allowance.
    drill_breakdown = []
    total_drill_time_min = 0.0
    for h in holes:
        hd = max(h["diameter_mm"], 0.5)
        rpm_drill = (1000.0 * mat.vc_drill) / (math.pi * hd)
        feed_drill = mat.f_drill * rpm_drill  # mm/min
        depth = h["est_depth_mm"] + 5.0
        per_hole_min = depth / feed_drill if feed_drill > 0 else 0
        hole_total = per_hole_min * h["count"]
        total_drill_time_min += hole_total
        drill_breakdown.append({
            "diameter_mm": hd, "count": h["count"], "depth_mm": h["est_depth_mm"],
            "minutes_per_hole": round(per_hole_min, 2), "total_minutes": round(hole_total, 2),
        })

    # Setup: indexed 4th/5th axis can reach more faces in one fixturing than a plain 3-axis mill;
    # this is a coarse, clearly-labeled assumption, not a per-face feature analysis.
    setup_count = 1 if inp.machine.axes >= 4 else 2
    setup_time_min = setup_count * inp.setup_minutes_per_fixturing

    cutting_time_min = facing_time_min + roughing_time_min + total_drill_time_min + profile_time_min
    total_time_min = setup_time_min + cutting_time_min

    warnings = []
    m = inp.machine
    if m.travel_x_mm and stock_x > m.travel_x_mm:
        warnings.append(f"Stock X ({stock_x:.1f}mm) exceeds machine travel_x_mm ({m.travel_x_mm}mm).")
    if m.travel_y_mm and stock_y > m.travel_y_mm:
        warnings.append(f"Stock Y ({stock_y:.1f}mm) exceeds machine travel_y_mm ({m.travel_y_mm}mm).")
    if m.travel_z_mm and stock_z > m.travel_z_mm:
        warnings.append(f"Stock Z ({stock_z:.1f}mm) exceeds machine travel_z_mm ({m.travel_z_mm}mm).")

    cost = (total_time_min / 60.0) * max(inp.hourly_rate, 0)

    return {
        "stock_mm": {"x": round(stock_x, 2), "y": round(stock_y, 2), "z": round(stock_z, 2)},
        "volume_to_remove_cm3": round(volume_to_remove_cm3, 2),
        "setup_count": setup_count,
        "time_breakdown_min": {
            "setup": round(setup_time_min, 2),
            "facing": round(facing_time_min, 2),
            "roughing": round(roughing_time_min, 2),
            "drilling": round(total_drill_time_min, 2),
            "profile_finish": round(profile_time_min, 2),
            "total": round(total_time_min, 2),
        },
        "drill_breakdown": drill_breakdown,
        "cost": round(cost, 2),
        "warnings": warnings,
        "assumptions": [
            f"Stock = part bounding box + {margin}mm margin per side (rectangular billet).",
            f"Roughing tool: {d}mm, {tool.flutes} flutes, {tool.stepover_pct}% stepover, {tool.doc_pct}% depth of cut, "
            f"{int(tool.roughing_efficiency*100)}% roughing efficiency (accounts for non-cutting moves).",
            "Hole depth estimated from detected cylindrical face's own bounding-box extent, +5mm approach/retract.",
            f"Setup: {setup_count} fixturing(s) x {inp.setup_minutes_per_fixturing} min "
            f"({'indexed 4th/5th axis reaches more faces per setup' if inp.machine.axes >= 4 else '3-axis assumed to need a second setup for back-side features'}).",
            "This is a geometry-based time/cost estimate (material-removal-rate + feed/speed formulas), not a simulated G-code toolpath.",
        ],
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "denplex-machining-quote"}


@app.post("/quote")
def quote(inp: QuoteIn):
    raw = base64.b64decode((inp.step_base64 or "").split(",")[-1])
    if not raw:
        raise HTTPException(400, "Empty STEP payload")
    try:
        analysis = _analyze(raw)
    except Exception as e:
        raise HTTPException(400, f"Could not read/analyze STEP file: {e}")

    try:
        breakdown = _time_breakdown(analysis["geometry"], analysis["holes"], inp)
    except Exception as e:
        raise HTTPException(500, f"Geometry read OK but time/cost calculation failed: {e}")

    return {"ok": True, "geometry": analysis["geometry"], "holes": analysis["holes"], **breakdown}
