"""
Denplex fixture design rules — the engineering knowledge the AI Fixture Concept generator
is held to.

WHY THIS FILE EXISTS
--------------------
The concept generator used to know only Denplex's own house style (base plate + V-cradle
posts, brazing rules). That is *how we build*, not *whether the design is right*. This file
carries the second half: the locating, clamping, tolerance and material rules that decide
whether a fixture holds the part rigidly, repeatably, and without binding.

PROVENANCE AND CONFIDENCE
-------------------------
These are Denplex's own rules, written here in our words. They were compiled from standard
jig-and-fixture practice, cross-checked against two reference manuals Neel supplied in
Sep 2026. Nothing from those manuals is reproduced — they are copyright-reserved, and this
ERP is intended to be sold, so only the underlying engineering is carried across.

Each rule is tagged so nobody later mistakes a plausible number for a measured one:

  [STD]   Standard practice. Found in any fixture-design reference, independently verifiable,
          safe to state to a customer.
  [SHOP]  To be confirmed against Denplex's own shop: our tooling, our suppliers, our
          machines. Treat as a starting point, not a specification.
  [WEAK]  Plausible but unsourced in what we have. Cited in the reference material without
          test data behind it. Use as a direction, never as a promise to a customer.

Only [STD] rules are ever stated to the AI as facts. [SHOP] and [WEAK] are held back or
phrased as "verify" so a generated concept never quotes an invented figure as gospel.

The reference manuals themselves are weak evidence: every subsection in the larger one
carries the identical heading, and the prose around the tables is generic. That is the
signature of machine-generated text. Its standard content (diamond pins, D2 at 58-62 HRC,
the clamping-force inequality) matches normal practice and is kept; its unsourced life-cycle
claims are tagged [WEAK] and never asserted.

HOW TO EXTEND
-------------
Add rules as Denplex learns them from real jobs — a fixture that chattered, a locator that
wore, a clamp that distorted a thin wall. Promote [SHOP] to [STD] once measured in-house,
and say what measured it. This file is the one place fixture knowledge lives; the AI prompt
is assembled from it, so editing here changes what the generator knows.
"""

# ---------------------------------------------------------------------------
# 1. Locating — killing the six degrees of freedom
# ---------------------------------------------------------------------------
# A free body has 6 degrees of freedom: translation along X, Y, Z and rotation about each.
# (Reference material calls this 12 by counting each direction separately; 6 is the
# conventional count and what we use, because it maps one-to-one onto what a locator does.)
LOCATING = """LOCATING (3-2-1 principle):
- A part has 6 degrees of freedom. The 3-2-1 scheme removes them with the minimum number of
  locators: 3 points on the primary datum face remove 3 (one translation, two rotations),
  2 on the secondary remove 2, 1 on the tertiary removes the last. Six points, six DOF.
- Spread the 3 primary points as WIDE as the part allows. A narrow triangle lets the part
  rock; the locating error is amplified by the ratio of part length to point spacing.
- Locate on MACHINED surfaces wherever one exists. Locating on an as-cast, as-forged or
  as-flame-cut face inherits that surface's variation directly into the machined result.
- NEVER use more than 6 locators on a rigid part. Redundant locators do not add stability —
  they fight each other, and which one wins depends on where the operator pushed. A seventh
  point makes the fixture less repeatable, not more.
- Thin, flexible or large-span parts are the exception: they need extra ADJUSTABLE or
  spring-loaded supports (not fixed locators) under unsupported spans, set after the part is
  seated on the six primary points. Fixed extra points would bend the part to the fixture.
- Two round pins in two holes WILL bind: the pin-to-pin distance and the hole-to-hole
  distance can never both be exact. Use ONE round pin (locates position) plus ONE DIAMOND
  (relieved) pin (locates rotation only, relieved across the line between the two holes so
  hole-pitch variation is taken up without jamming). This is not an optimisation; two round
  pins produce parts that will not load.
- Orient the diamond pin's relief ACROSS the line joining the two holes, so its full width
  bears perpendicular to that line where it resists rotation.
- POKA-YOKE: make a wrongly-oriented part physically impossible to load, not merely
  detectable. Add a blocking pin or an asymmetric rest that fouls on the wrong orientation.
  A symmetrical fixture will eventually be loaded backwards, whatever the instructions say."""

# ---------------------------------------------------------------------------
# 2. Clamping — force, direction, and what not to squash
# ---------------------------------------------------------------------------
# Fclamp >= Sf * (Fcutting / mu) + Fvibration
#   Sf  safety factor 2.0-3.5                       [STD as a range]
#   mu  static friction, steel on dry clean steel ~0.15  [STD]
# The inequality is standard force-equilibrium: friction alone must resist the cutting
# force, scaled for uncertainty, plus a dynamic allowance. mu collapses if there is coolant,
# oil or scale in the joint, which is exactly the shop condition — hence the safety factor.
CLAMPING = """CLAMPING:
- Size clamping force from equilibrium, not by feel:
      F_clamp  >=  Sf * ( F_cutting / mu )  +  F_vibration
  where Sf = 2.0 to 3.5 (use the high end for interrupted cuts, roughing, or when the part
  is held by friction alone), mu = coefficient of static friction (about 0.15 for dry clean
  steel on steel — assume LESS if coolant or oil can reach the contact), and F_vibration is
  an allowance for dynamic load. State the numbers used so they can be checked.
- Clamp AGAINST a locator, never into free space. The force must push the part onto the
  datum, so the locator takes the load and the clamp only holds it there. A clamp that
  pushes a part away from its locator has unseated the part it was meant to hold.
- Clamp over SOLID SUPPORT. Clamping over an unsupported span bends the part; it machines
  straight and springs back bent when released. If a clamp must sit over a span, put a rest
  pad or adjustable support directly beneath it.
- Direct clamping force into the strongest section — a rib, a boss, a flange. Never onto a
  thin wall, a finished face, or anything that will be a functional surface.
- NEVER clamp on a weld joint, braze joint, or any area to be joined.
- Clamps must not obstruct tool paths, chip evacuation, or the operator's loading motion.
  Check swarf can fall clear; chips trapped under a locator are a repeatability fault that
  looks like a machine problem.
- Prefer quick-acting actuation for production quantities (toggle clamps, cam, pneumatic or
  hydraulic). Screw clamps are fine for low volume and for setting, but operator-dependent
  force on a production fixture means part-to-part variation.
- Hydraulic/pneumatic: state the cylinder bore and working pressure, so the delivered force
  can be verified against the equilibrium figure above rather than assumed."""

# ---------------------------------------------------------------------------
# 3. Materials and hardness for fixture elements
# ---------------------------------------------------------------------------
# Grades and hardnesses below are standard for these duties. Fits are ISO. Flatness figures
# are what a surface grinder routinely holds — confirm against our own grinding capability
# before quoting them to a customer.
MATERIALS = """FIXTURE ELEMENT MATERIALS (typical — confirm against what we actually stock):
- Locating pins: tool steel, e.g. AISI D2, hardened 58-62 HRC and ground. Press fit into the
  plate (or into a hardened bushing) on an interference fit; the locating diameter itself
  ground to a close fit such as g6 against the part's hole.
- Rest buttons / rest pads: case-hardened steel around 55 HRC, ground, height held to a few
  microns across a set so the three primary points lie in one plane.
- Clamping pads and straps: medium-carbon steel, through-hardened and tempered — hard enough
  not to peen, tough enough not to crack. Soft (brass, nylon, urethane) pads only where the
  clamped face is finished or soft.
- Base plate: cast iron (e.g. FG 260) where damping matters, or hot-rolled plate (e.g. A36 /
  MS) for cost and weldability, ground flat on the working face. Cast iron's damping is the
  real reason to pay for it on a milling fixture; MS is fine for drilling and inspection.
- Drill bushings: hardened and ground, press-fit for a fixed position, or slip/renewable in a
  liner where the bushing will wear out or the drill size will change.
- Locating and clamping faces on a brazing or welding fixture: stainless or coated, so filler
  and flux do not wet the fixture and the fixture does not sink heat out of the joint.
- ALWAYS HARDEN a surface the part rubs on every cycle. An unhardened locator or rest pad
  wears, and the wear shows up as drift in a dimension nobody changed — the hardest kind of
  quality problem to diagnose. Where the plate itself cannot be hardened, use a hardened
  press-fit bushing or a replaceable insert pad so the wear part is a consumable.
- Replaceable wear parts are cheaper than a fixture rebuild: design the locator as an insert,
  not as a feature of the plate."""

# ---------------------------------------------------------------------------
# 4. Tolerance and fits
# ---------------------------------------------------------------------------
# The fixture-tighter-than-part rule of thumb: fixture tolerance ~20-50% of part tolerance.
# 20% (the 1:5 rule) is the conventional target. Tighter costs money for no gain; looser
# eats the part tolerance the machinist needs.
TOLERANCES = """TOLERANCES AND FITS:
- The fixture must be TIGHTER than the part it makes. Target fixture-feature tolerance at
  roughly 20-30% of the corresponding part tolerance (the "1:5 rule"). Going tighter than
  that adds cost and lead time without improving the part.
- Do NOT carry the same tolerance everywhere. Tight only on locating and datum-forming
  features; ISO 2768 medium is right for the plate outline, cutouts, and clearance holes.
  A drawing that is tight everywhere reads as "the designer did not decide" and gets quoted
  accordingly.
- Locating pin to part hole: close running / location fit (e.g. g6 shaft into the part's
  hole, or h5 where the part hole is itself ground). State the fit, not just the diameter —
  a pin diameter without a fit class is not manufacturable information.
- Pin or bushing into the fixture plate: interference (press) fit, so it cannot creep.
- Rest button set: heights matched within a few microns across the set. The absolute height
  matters less than the three being coplanar.
- Base plate working face: ground flat, typically within about 0.01 mm over the locating
  area for a machining fixture. Loosen this for inspection-only or brazing fixtures where
  the datum is established differently.
- Reference every fixture dimension to the same DATUM SYSTEM as the part drawing. A fixture
  dimensioned from its own convenient corner, while the part is dimensioned from a machined
  edge, stacks two independent tolerance chains and the error is discovered at first-off.
- Read the part's GD&T before sizing anything: a datum called out on the part drawing tells
  you which surface the fixture must locate from, and a positional tolerance tells you how
  much of the budget the fixture is allowed to consume."""

# ---------------------------------------------------------------------------
# 5. Design review checklist — the failure modes worth checking for by name
# ---------------------------------------------------------------------------
# Every item here is a fault that is cheap to catch on paper and expensive to find at
# first-off. Ordered roughly by how often it actually happens.
CHECKLIST = """DESIGN REVIEW CHECKLIST (check each; report any that this concept cannot rule out):
1. Over-constraint — more than 6 locating points on a rigid part, or two round pins in two
   holes. Both make the fixture unrepeatable or unloadable.
2. Clamping force into an unsupported span, a thin wall, or a finished face — part distorts
   and springs back after release.
3. Clamp or locator fouling the tool path, a fixture bolt, or the operator's loading motion.
4. No chip escape route — swarf collects on a locating face and the part sits high.
5. Unhardened surface in rubbing contact — drift appears over a production run.
6. Locating from an unmachined (as-cast / as-cut) surface when a machined one was available.
7. Part loadable in a wrong orientation — no physical poka-yoke feature.
8. Over-constraint under HEAT (welding, brazing): locate from one end, let the rest float, or
   the part or the fixture will buckle.
9. Accessibility: can the operator reach the clamps, see the part is seated, and get it out
   with gloves on and the spindle where it will be?
10. Fixture dimensioned from a different datum than the part drawing uses.
11. Tolerance applied uniformly instead of only where it locates.
12. No replaceable wear part — the whole fixture becomes scrap when one pad wears.
13. Fixture heavier than the operator or the table can reasonably handle; no lifting point.
14. Stability: does it sit flat and stay put without the clamps, and is the centre of mass
    inside the footprint?"""

# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------
# Kept as one flat string built once at import, not concatenated per request: this text goes
# into every /fixture/concept call and there is no reason to rebuild it each time.
#
# Ordered locate -> clamp -> material -> tolerance -> review, which is the order a designer
# actually decides in, so the model's reasoning follows the same sequence.
FIXTURE_DESIGN_RULES = (
    "\n\nDENPLEX FIXTURE DESIGN RULES (engineering rules you are held to — apply every one "
    "that is relevant to this part, and say in `assumptions` which ones you could not verify "
    "from the inputs given):\n\n"
    + LOCATING + "\n\n"
    + CLAMPING + "\n\n"
    + MATERIALS + "\n\n"
    + TOLERANCES + "\n\n"
    + CHECKLIST + "\n\n"
    "HOW TO USE THESE RULES:\n"
    "- Apply them to THIS part's real geometry. Quote actual mm figures from the inputs.\n"
    "- State the numbers behind a recommendation (clamping force and the Sf and mu used; fit "
    "classes on pins; hardness on wear surfaces) so an engineer can check your arithmetic.\n"
    "- Put any checklist item you cannot rule out into `distortion_risks` or "
    "`access_and_clearance` as a named risk. Do NOT claim the design is clear of a risk you "
    "have no information about — say what would need checking.\n"
    "- Material grades, hardnesses and fits above are TYPICAL values. Present them as "
    "starting points to confirm against stock and supplier, not as specification.\n"
    "- Never invent a life-cycle figure (how many parts before a locator wears). If wear "
    "matters, say the locator should be a replaceable hardened insert and leave it there."
)

__all__ = [
    "FIXTURE_DESIGN_RULES",
    "LOCATING", "CLAMPING", "MATERIALS", "TOLERANCES", "CHECKLIST",
]
