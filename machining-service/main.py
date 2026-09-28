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
    simultaneous_axes: int = 3   # not yet used in the time/cost formulas below; kept in sync with the
                                  # ERP's Machine master (e.g. a "4+1" machine: axes=5, simultaneous_axes=4)
                                  # for when a future cycle-time refinement wants it.
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


# ---------------------------------------------------------------------------
# Tolerance and surface-finish cost multipliers
# ---------------------------------------------------------------------------
# Tighter tolerances and finer finishes cost more because they force slower feeds and extra
# finishing passes. These factors are applied to CUTTING time only — never to setup (a tight
# part doesn't take longer to clamp) and never to material (the billet costs the same).
#
# The published tables express these as multipliers on total part COST, which bundles in
# secondary operations like grinding and honing. We apply them to cutting time instead, which
# is the part we can actually model; where the spec genuinely implies grinding or lapping the
# estimate will run LOW and the service says so in a warning rather than quietly pretending.
#
# Baseline is the middle row of each table (±0.005" / ~±0.125 mm, and Ra 3.2 µm) — ordinary
# milling and turning with a roughing pass plus one finishing pass. Keys are mm and µm because
# that is what Denplex's drawings use; the inch equivalents are noted for cross-checking.
TOLERANCE_FACTORS = {
    "0.25":   (0.85, "±0.25 mm (±0.010\") loose — single finish pass, standard feeds"),
    "0.125":  (1.00, "±0.125 mm (±0.005\") standard — baseline, roughing + finishing"),
    "0.05":   (2.25, "±0.05 mm (±0.002\") close — multiple finishing passes, reduced feed"),
    "0.025":  (4.00, "±0.025 mm (±0.001\") precision — finishing passes plus grinding or honing"),
    "0.0125": (7.50, "±0.0125 mm (±0.0005\") ultra — grinding/honing plus lapping"),
}
DEFAULT_TOLERANCE = "0.125"

FINISH_FACTORS = {
    "6.3": (0.90, "Ra 6.3 µm — as-milled, no finishing emphasis"),
    "3.2": (1.00, "Ra 3.2 µm (125 µin) standard — baseline, normal mill/lathe finish"),
    "1.6": (1.50, "Ra 1.6 µm — light extra finishing pass"),
    "0.8": (2.25, "Ra 0.8 µm (32 µin) fine — extra semi-finishing pass, reduced feed"),
    "0.2": (4.50, "Ra 0.2 µm (8 µin) super-fine — multiple passes plus polishing or honing"),
    "0.1": (7.50, "Ra 0.1 µm mirror — lapping or polishing, largely manual"),
}
DEFAULT_FINISH = "3.2"

# Specs at or beyond these levels cannot be reached by milling/turning alone. The multiplier
# still scales the cutting time, but a separate grinding/lapping operation is real work this
# service does not model, so the quote is flagged as an under-estimate rather than trusted.
_NEEDS_SECONDARY_TOL = {"0.025", "0.0125"}
_NEEDS_SECONDARY_FIN = {"0.2", "0.1"}


class TurningOpIn(BaseModel):
    """One lathe operation, priced by the classic shop formula  T = L / (f × N).

    Turning is NOT auto-detected from the STEP file. Deciding that a face is a turned diameter
    rather than a milled boss needs the process plan, not the geometry — a cylindrical face can
    legitimately be produced either way, and guessing wrong silently moves the whole job onto
    the wrong machine rate. So the estimator asks for turned operations explicitly and computes
    each one exactly; nothing is invented from the bounding box.
    """
    operation: str = "turning"     # turning | facing | drilling | threading | knurling | boring
    length_mm: float = 0           # length of cut along the feed direction
    diameter_mm: float = 0         # work diameter at the cut (decides rpm from cutting speed)
    feed_mm_rev: float = 0.2       # f — feed per revolution
    passes: int = 1                # number of cuts to reach full depth
    vc_m_min: float = 0            # cutting speed; 0 = fall back to the material's vc_mill


class CostingIn(BaseModel):
    """Everything needed to turn minutes into money. All rates in the ERP's own currency."""
    material_price_per_kg: float = 0     # raw stock rate; 0 = material cost is not included
    tool_cost: float = 0                 # cost of one cutting tool
    tool_life_parts: int = 0             # parts produced per tool; 0 = tooling cost not included
    overhead_pct: float = 0              # α, applied to conversion cost only — see _costing()
    scrap_pct: float = 0                 # extra stock bought per part to cover rejects/offcuts


class QuoteIn(BaseModel):
    step_base64: str
    stock_margin_mm: float = 3
    machine: MachineIn = MachineIn()
    material: MaterialIn = MaterialIn()
    tool: ToolIn = ToolIn()
    setup_minutes_per_fixturing: float = 25
    hourly_rate: float = 0
    # Batch size. Setup happens ONCE per batch, so it is amortised across qty — quoting 100
    # parts must not charge 100 full setups. Defaults to 1 (a one-off), which reproduces the
    # old behaviour exactly for a single part.
    qty: int = 1
    tolerance_mm: str = DEFAULT_TOLERANCE
    surface_finish_ra: str = DEFAULT_FINISH
    turning_ops: List[TurningOpIn] = []
    costing: CostingIn = CostingIn()


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


def _suggest_axes(shape) -> dict:
    """Heuristic axis-requirement classifier: groups planar-face normals and cylindrical-face axis
    directions into distinct orientations (opposite-facing normals count as the SAME orientation,
    since a plain 3-axis mill reaches both — just from two setups/flips).

    The key distinction is NOT "how many distinct orientations" but "how many are OBLIQUE (not
    aligned to any single principal X/Y/Z axis)". A plain prismatic part (a box, an L-bracket, a
    plate with side holes) has faces/holes along up to three PRINCIPAL directions (X, Y, Z) — that
    is completely normal 3-axis-with-flips work, never a reason for 4 or 5 axis. Only when a face or
    hole axis is tilted at a compound angle (not itself X, Y, or Z) does a rotary/tilting axis
    actually help:
      0 oblique orientations                  -> 3-axis (prismatic; extra setups/flips cover any
                                                  number of the 3 principal directions)
      1 oblique orientation (or several oblique
        orientations that share one common axis) -> 4-axis (one rotary/indexed move reaches it —
                                                  exactly the case a "4+1" trunnion-table VMC covers)
      2+ independent oblique orientations       -> 5-axis-simultaneous recommended (not reducible
                                                  to a single rotary indexer)
    This is intentionally a suggestion with visible reasoning, not a hard rule — see README/UI:
    the shop always confirms and can pick any machine regardless of what's suggested here.
    """
    PRINCIPAL = [(1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)]

    def _canon_dir(vec):
        n = vec.Length
        if n < 1e-6:
            return None
        x, y, z = vec.x / n, vec.y / n, vec.z / n
        # Canonicalize sign so opposite-facing normals (e.g. top face vs bottom face) collapse to
        # the same orientation key — a 3-axis mill reaches both with a single flip, not a rotary axis.
        for c in (x, y, z):
            if abs(c) > 1e-6:
                if c < 0:
                    x, y, z = -x, -y, -z
                break
        return (round(x, 3), round(y, 3), round(z, 3))

    def _is_principal(d):
        return any(abs(sum(a * b for a, b in zip(d, p))) > 0.999 for p in PRINCIPAL)

    dir_counts = Counter()
    for f in shape.Faces:
        try:
            surf = f.Surface
            cname = surf.__class__.__name__
            if cname == "Plane":
                key = _canon_dir(surf.Axis)
            elif cname == "Cylinder":
                key = _canon_dir(surf.Axis)
            else:
                continue
            if key:
                dir_counts[key] += 1
        except Exception:
            continue

    # Ignore orientations backed by only a single face — usually a stray chamfer/fillet, not a
    # real machined feature direction, so they'd otherwise inflate the suggestion unnecessarily.
    significant = [d for d, c in dir_counts.items() if c >= 2] or list(dir_counts.keys())
    principal_dirs = [d for d in significant if _is_principal(d)]
    oblique_dirs = [d for d in significant if not _is_principal(d)]

    reasoning = []
    if not oblique_dirs:
        suggested = 3
        n_principal = len(principal_dirs)
        reasoning.append(
            f"All detected faces/holes are axis-aligned ({n_principal} principal direction"
            f"{'s' if n_principal != 1 else ''} — a prismatic part) — 3-axis milling reaches every "
            "feature (extra setups/flips as needed for faces on different sides)."
        )
    elif len(oblique_dirs) == 1 or all(
        abs(sum(a * b for a, b in zip(oblique_dirs[0], d))) > 0.999 for d in oblique_dirs
    ):
        suggested = 4
        ref_dir = oblique_dirs[0]
        # angle vs the closest principal axis, just for a concrete, readable number in the reasoning
        closest = max(abs(sum(a * b for a, b in zip(ref_dir, p))) for p in PRINCIPAL)
        angle_deg = math.degrees(math.acos(max(-1.0, min(1.0, closest))))
        reasoning.append(
            f"Detected a compound-angle feature orientation (~{angle_deg:.0f} degrees off the "
            "nearest principal axis) alongside the part's flat/prismatic faces — reachable with "
            "one rotary/indexed move, so a 4-axis machine (including a '4+1' 4-simultaneous + "
            "indexed-5th configuration) should cover this part in a single setup."
        )
    else:
        suggested = 5
        reasoning.append(
            f"Detected {len(oblique_dirs)} independent compound-angle feature orientations — not "
            "reducible to a single rotary indexer, so true 5-axis-simultaneous machining (or "
            "several manual setups on a 3/4-axis machine) is recommended for continuous-orientation "
            "access to all features."
        )

    n_axes = len(significant)
    return {"suggested_axes": suggested, "distinct_axis_count": n_axes, "reasoning": reasoning}


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
    axis_analysis = _suggest_axes(shape)
    return {"geometry": geometry, "holes": holes, "axis_analysis": axis_analysis}


def _turning_time(ops: List[TurningOpIn], mat: MaterialIn) -> tuple:
    """Lathe time by the standard shop formula, one row per operation.

        N = (1000 × Vc) / (π × D)        spindle speed, rev/min
        T = L / (f × N) × passes         cut time, minutes

    Threading uses pitch in place of feed per revolution (the tool must advance exactly one
    pitch per turn), which is the same formula with f = pitch — so the caller passes the pitch
    as feed_mm_rev and it falls out correctly with no special case.
    """
    rows = []
    total = 0.0
    for op in ops:
        d = max(op.diameter_mm, 0.1)
        vc = op.vc_m_min if op.vc_m_min > 0 else mat.vc_mill
        rpm = (1000.0 * vc) / (math.pi * d)
        feed_mm_min = max(op.feed_mm_rev, 0.001) * rpm
        passes = max(op.passes, 1)
        t = (max(op.length_mm, 0) / feed_mm_min) * passes if feed_mm_min > 0 else 0.0
        total += t
        rows.append({
            "operation": op.operation,
            "length_mm": op.length_mm,
            "diameter_mm": op.diameter_mm,
            "rpm": round(rpm, 1),
            "feed_mm_min": round(feed_mm_min, 1),
            "passes": passes,
            "minutes": round(t, 3),
        })
    return round(total, 3), rows


def _costing(cutting_time_min: float, setup_time_min: float, stock_volume_cm3: float,
             inp: QuoteIn) -> dict:
    """Split the quote into material + machine + tooling + overhead, per part.

    Two things this deliberately gets right, because both are easy to get wrong and both move
    the number a lot:

    1. SETUP IS AMORTISED over the batch. Setup is paid once per batch, so each part carries
       setup_time / qty. Charging every part a full setup is how a 100-off quote ends up with
       83 hours of setup in it instead of 50 minutes.
    2. OVERHEAD APPLIES TO CONVERSION COST ONLY — the machine cost — not to material and not
       to bought-out tooling. Marking up material with factory overhead inflates the quote on
       exactly the jobs where the customer is most likely to check the metal price.

    Labour is not a separate term here: Denplex's machine hourly rate is blended (machine plus
    operator), so a separate labour line would double-count the operator.
    """
    c = inp.costing
    qty = max(inp.qty, 1)

    setup_per_part_min = setup_time_min / qty
    machine_minutes = cutting_time_min + setup_per_part_min
    machine_cost = (machine_minutes / 60.0) * max(inp.hourly_rate, 0)

    # Material is costed on the STOCK, not the finished part: the shop buys and pays for the
    # billet including everything turned into swarf.
    stock_kg = (stock_volume_cm3 * inp.material.density) / 1000.0
    stock_kg_with_scrap = stock_kg * (1.0 + max(c.scrap_pct, 0) / 100.0)
    material_cost = stock_kg_with_scrap * max(c.material_price_per_kg, 0)

    # Tool cost spread over the parts one tool survives.
    tooling_cost = (c.tool_cost / c.tool_life_parts) if c.tool_life_parts > 0 else 0.0

    overhead_cost = machine_cost * (max(c.overhead_pct, 0) / 100.0)
    total = material_cost + machine_cost + tooling_cost + overhead_cost

    return {
        "qty": qty,
        "per_part": {
            "material": round(material_cost, 2),
            "machine": round(machine_cost, 2),
            "tooling": round(tooling_cost, 2),
            "overhead": round(overhead_cost, 2),
            "total": round(total, 2),
        },
        "batch_total": round(total * qty, 2),
        "stock_kg_per_part": round(stock_kg_with_scrap, 3),
        "setup_minutes_per_part": round(setup_per_part_min, 2),
        "machine_minutes_per_part": round(machine_minutes, 2),
        "notes": [
            f"Setup ({setup_time_min:.0f} min) is charged ONCE for the batch and divided across "
            f"{qty} part(s) = {setup_per_part_min:.2f} min/part.",
            "Machine rate is treated as blended (machine + operator), so there is no separate "
            "labour line — adding one would double-count the operator.",
            ("Overhead is 0%, so no factory overhead is recovered in this quote. Set an overhead "
             "% in Settings once you know whether your machine rate already includes it."
             if c.overhead_pct <= 0 else
             f"Overhead {c.overhead_pct:.1f}% applied to machine cost only (not material, not tooling)."),
            ("Material not costed (no material price set)." if c.material_price_per_kg <= 0 else
             f"Material = {stock_kg_with_scrap:.3f} kg of stock @ {c.material_price_per_kg:.2f}/kg "
             f"(billet volume incl. swarf" + (f", +{c.scrap_pct:.0f}% scrap allowance)." if c.scrap_pct > 0 else ").")),
            ("Tooling not costed (no tool cost / tool life set)." if tooling_cost <= 0 else
             f"Tooling = {c.tool_cost:.2f} per tool / {c.tool_life_parts} parts per tool."),
        ],
    }


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

    turning_time_min, turning_breakdown = _turning_time(inp.turning_ops, mat)

    base_cutting_min = (facing_time_min + roughing_time_min + total_drill_time_min
                        + profile_time_min + turning_time_min)

    # Tolerance and finish stretch the CUTTING time only — setup is unaffected by how tight the
    # drawing is. Unknown keys fall back to the baseline rather than raising: a quote should not
    # fail because someone typed a tolerance the table doesn't list.
    tol_key = str(inp.tolerance_mm) if str(inp.tolerance_mm) in TOLERANCE_FACTORS else DEFAULT_TOLERANCE
    fin_key = str(inp.surface_finish_ra) if str(inp.surface_finish_ra) in FINISH_FACTORS else DEFAULT_FINISH
    tol_factor, tol_label = TOLERANCE_FACTORS[tol_key]
    fin_factor, fin_label = FINISH_FACTORS[fin_key]

    # The two are NOT multiplied together. A part needing Ra 0.8 µm and ±0.05 mm gets its
    # finishing passes once, not twice over — multiplying would give 2.25 × 2.25 = 5.06× for a
    # part that a shop would quote at roughly 2.25×. Taking the larger of the two lets the
    # binding requirement drive the cost, which is how the work actually runs.
    spec_factor = max(tol_factor, fin_factor)
    cutting_time_min = base_cutting_min * spec_factor
    total_time_min = setup_time_min + cutting_time_min

    warnings = []
    if str(inp.tolerance_mm) not in TOLERANCE_FACTORS and inp.tolerance_mm:
        warnings.append(f"Unknown tolerance '{inp.tolerance_mm}' — quoted at the {tol_key} mm baseline instead.")
    if str(inp.surface_finish_ra) not in FINISH_FACTORS and inp.surface_finish_ra:
        warnings.append(f"Unknown finish Ra '{inp.surface_finish_ra}' — quoted at the {fin_key} µm baseline instead.")
    if tol_key in _NEEDS_SECONDARY_TOL or fin_key in _NEEDS_SECONDARY_FIN:
        warnings.append(
            "This tolerance/finish cannot be held by milling or turning alone — it needs grinding, "
            "honing or lapping. That secondary operation is NOT modelled here, so treat this quote "
            "as an UNDER-estimate and add the secondary process cost by hand.")
    m = inp.machine
    if m.travel_x_mm and stock_x > m.travel_x_mm:
        warnings.append(f"Stock X ({stock_x:.1f}mm) exceeds machine travel_x_mm ({m.travel_x_mm}mm).")
    if m.travel_y_mm and stock_y > m.travel_y_mm:
        warnings.append(f"Stock Y ({stock_y:.1f}mm) exceeds machine travel_y_mm ({m.travel_y_mm}mm).")
    if m.travel_z_mm and stock_z > m.travel_z_mm:
        warnings.append(f"Stock Z ({stock_z:.1f}mm) exceeds machine travel_z_mm ({m.travel_z_mm}mm).")

    costing = _costing(cutting_time_min, setup_time_min, stock_volume_cm3, inp)

    # `cost` is kept as the per-part total so existing callers and stored quotes keep working;
    # `cost_breakdown` is the new detail. Removing this key would silently change what every
    # saved quote and the Machining Quote page display.
    cost = costing["per_part"]["total"]

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
            "turning": round(turning_time_min, 2),
            "spec_uplift": round(cutting_time_min - base_cutting_min, 2),
            "total": round(total_time_min, 2),
        },
        "spec_factors": {
            "tolerance_mm": tol_key,
            "tolerance_factor": tol_factor,
            "tolerance_label": tol_label,
            "surface_finish_ra": fin_key,
            "finish_factor": fin_factor,
            "finish_label": fin_label,
            "applied_factor": spec_factor,
            "applied_to": "cutting time only (not setup, not material)",
            "rule": "the larger of the two factors is used, not their product",
        },
        "drill_breakdown": drill_breakdown,
        "turning_breakdown": turning_breakdown,
        "cost": round(cost, 2),
        "cost_breakdown": costing,
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

    return {
        "ok": True, "geometry": analysis["geometry"], "holes": analysis["holes"],
        "axis_analysis": analysis["axis_analysis"], **breakdown,
    }
