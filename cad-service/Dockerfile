FROM python:3.11-slim

# System libs needed by OpenCASCADE (CadQuery) and cairosvg, plus xvfb + GLX libs so VTK can do
# real offscreen shaded rendering (VTK's default render window wants an X display even with
# SetOffScreenRendering(1) — xvfb-run gives it a virtual one for the process's whole lifetime).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libxrender1 libxext6 libsm6 libglib2.0-0 libfontconfig1 \
    libcairo2 libpango-1.0-0 libgdk-pixbuf-2.0-0 \
    xvfb libglu1-mesa libgl1-mesa-dri \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "xvfb-run -a --server-args='-screen 0 1024x768x24' uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
