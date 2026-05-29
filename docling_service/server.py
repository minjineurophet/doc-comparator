"""
Docling parsing microservice
- POST /parse  : multipart file → { markdown, format }
- GET  /health : liveness check
"""

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Docling Parser Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://localhost:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Lazy-initialised — first request pays the model-load cost once
_converter = None

def get_converter():
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter
        _converter = DocumentConverter()
    return _converter

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".xls", ".pptx", ".html"}


def _detect_format(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    mapping = {
        ".pdf":  "pdf",
        ".docx": "docx",
        ".xlsx": "xlsx",
        ".xls":  "xlsx",
        ".pptx": "pptx",
        ".html": "html",
    }
    if ext not in mapping:
        raise ValueError(f"지원하지 않는 파일 형식입니다 ({filename}). PDF, Word(.docx), Excel(.xlsx)만 지원합니다.")
    return mapping[ext]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse")
async def parse_document(file: UploadFile = File(...)):
    try:
        fmt = _detect_format(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ext = Path(file.filename).suffix.lower()
    content = await file.read()

    # Write to temp file — Docling requires a real file path
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = get_converter().convert(tmp_path)
        markdown = result.document.export_to_markdown()
        try:
            text = result.document.export_to_text()
        except Exception:
            # Fallback: strip markdown heading markers
            text = '\n'.join(
                line.lstrip('#').strip() if line.startswith('#') else line
                for line in markdown.split('\n')
            )
        return JSONResponse({
            "markdown": markdown,
            "text": text,
            "format": fmt,
            "filename": file.filename,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파싱 실패: {str(e)}")
    finally:
        os.unlink(tmp_path)
