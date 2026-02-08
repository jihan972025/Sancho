from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..file_ops.manager import (
    list_directory,
    create_file,
    create_directory,
    request_delete,
    confirm_delete,
    move_path,
    read_file,
)
from ..agents.file_agent import organize_directory

router = APIRouter(prefix="/api/files", tags=["files"])


class CreateRequest(BaseModel):
    path: str
    is_dir: bool = False
    content: str = ""


class DeleteRequest(BaseModel):
    path: str


class ConfirmDeleteRequest(BaseModel):
    token: str


class MoveRequest(BaseModel):
    src: str
    dst: str


class OrganizeRequest(BaseModel):
    path: str
    model: Optional[str] = None
    instructions: str = ""


@router.get("/list")
async def api_list_directory(path: str):
    try:
        items = list_directory(path)
        return {"items": [i.model_dump() for i in items]}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/create")
async def api_create(req: CreateRequest):
    try:
        if req.is_dir:
            result = create_directory(req.path)
        else:
            result = create_file(req.path, req.content)
        return result.model_dump()
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.delete("/delete")
async def api_delete(req: DeleteRequest):
    try:
        token = request_delete(req.path)
        return {
            "token": token.token,
            "path": token.path,
            "item_count": token.item_count,
            "total_size": token.total_size,
            "expires_at": token.expires_at,
            "message": f"Confirm deletion of {token.item_count} items ({token.total_size} bytes). Token expires in 30 seconds.",
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/delete/confirm")
async def api_confirm_delete(req: ConfirmDeleteRequest):
    try:
        confirm_delete(req.token)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/move")
async def api_move(req: MoveRequest):
    try:
        result = move_path(req.src, req.dst)
        return result.model_dump()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("/read")
async def api_read_file(path: str):
    try:
        content = read_file(path)
        return {"path": path, "content": content}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/organize")
async def api_organize(req: OrganizeRequest):
    try:
        results = await organize_directory(req.path, req.model, req.instructions)
        return {"operations": results}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
