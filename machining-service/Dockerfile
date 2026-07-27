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

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Build-time sanity check: fail the BUILD (visible in Railway build logs) rather than only at
# first request if `import Part` doesn't work from this apt-installed FreeCAD in system python3.
RUN python3 -c "import Part; print('FreeCAD Part module import OK, version:', Part.__doc__ and 'loaded' or 'loaded')"

COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
