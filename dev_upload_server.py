"""
Servidor descartavel de upload pra dev area temporaria.
NAO tem autenticacao -- so existe enquanto essa VPS de 30 dias estiver de pe.
Roda numa porta separada da app principal (main.py fica intocado).
"""

import os
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse

UPLOAD_DIR = Path("/root/pixelforge/dev-uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()


@app.get("/ui", response_class=HTMLResponse)
def ui():
    # Desativado -- fica so a API (/upload) disponivel, chamada automatica.
    return HTMLResponse("UI desativada. Use a API diretamente.", status_code=404)


@app.get("/")
def list_files():
    files = []
    for f in sorted(UPLOAD_DIR.iterdir()):
        if f.is_file():
            files.append({"name": f.name, "size_bytes": f.stat().st_size})
    return {"upload_dir": str(UPLOAD_DIR), "files": files}


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    safe_name = os.path.basename(file.filename or "upload.bin")
    dest = UPLOAD_DIR / safe_name

    with open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    return JSONResponse(
        {
            "saved_as": str(dest),
            "size_bytes": dest.stat().st_size,
        }
    )
