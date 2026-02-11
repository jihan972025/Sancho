from fastapi import APIRouter, HTTPException

from ..memory import load_memories, delete_memory, toggle_memory, clear_all_memories

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
async def list_memories():
    return {"memories": [m.model_dump() for m in load_memories()]}


@router.delete("/{memory_id}")
async def remove_memory(memory_id: str):
    if delete_memory(memory_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Memory not found")


@router.post("/{memory_id}/toggle")
async def toggle_memory_endpoint(memory_id: str):
    mem = toggle_memory(memory_id)
    if mem:
        return {"memory": mem.model_dump()}
    raise HTTPException(status_code=404, detail="Memory not found")


@router.delete("")
async def clear_memories():
    count = clear_all_memories()
    return {"status": "cleared", "count": count}
