# Ubuntu 22.04 (jammy), NOT python:3.11-slim (Debian) — chosen deliberately because `apt-cache
# search freecad` was verified (in the dev sandbox, which is also Ubuntu 22.04) to have
# freecad-python3 / freecad-common available. There's no pip wheel for FreeCAD and no way to test
# this locally before deploy, so matching the exact distro we confirmed package availability on
# removes one whole class of blind-deploy risk.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    freecad-python3 freecad-common \
    && rm -rf /var/lib/apt/lists/*

# freecad-python3's Part/App/.so extension modules are installed at /usr/lib/freecad-python3/lib
# (confirmed by downloading and inspecting the actual .deb — `dpkg -c libfreecad-python3-0.19...deb`
# — since this sandbox has no root to apt-get install it directly). That directory is NOT on
# Python's default sys.path, so a plain `import Part` fails with ModuleNotFoundError even though
# apt install succeeded and pulled in every runtime dependency (libocct-*, libcoin80c, PySide2,
# etc. — all declared as hard Depends, so --no-install-recommends above does not skip them).
ENV PYTHONPATH=/usr/lib/freecad-python3/lib

# With PYTHONPATH fixed, `import Part` alone still crashed with a bare "Segmentation fault" (no
# Python traceback). Root-caused this by downloading every .deb this Dockerfile installs, extracting
# them (no root needed — dpkg-deb -x) into an unprivileged mount namespace on the exact same Ubuntu
# 22.04 base, and reproducing the identical crash under gdb: it's a NULL-pointer type check inside
# Part.so's own module init (PyType_Ready() on a Python type whose base-type pointer is still NULL).
# Cause: Part's Python types inherit from FreeCAD's own base types (App::DocumentObject etc.), which
# only get registered once `import FreeCAD` has run — importing Part on its own, first, crashes hard
# instead of raising an ImportError. Fix is just import order (see main.py); no virtual display /
# xvfb / GPU workaround is needed (that was a mis-diagnosis from an earlier deploy — the crash
# reproduces identically with zero X11/OpenGL involved).
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Build-time sanity check: fail the BUILD (visible in Railway build logs) rather than only at
# first request if FreeCAD's Part module isn't importable in this apt-installed system python3.
# Import order matters here — see comment above.
RUN python3 -c "import FreeCAD; import Part; print('FreeCAD Part module import OK')"

COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
