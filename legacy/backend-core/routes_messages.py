from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Message
from schemas import MessageCreate, MessageRead

router = APIRouter(prefix="/messages", tags=["messages"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/{user_id}/{partner_id}",
    response_model=list[MessageRead],
    summary="Load all messages between two users, oldest first",
)
async def get_messages(
    user_id: str,
    partner_id: str,
    db: DbSession,
) -> list[Message]:
    result = await db.scalars(
        select(Message)
        .where(
            or_(
                and_(Message.sender_id == user_id,    Message.receiver_id == partner_id),
                and_(Message.sender_id == partner_id, Message.receiver_id == user_id),
            )
        )
        .order_by(Message.timestamp.asc())
    )
    return list(result.all())


@router.post(
    "/{user_id}/{partner_id}",
    response_model=MessageRead,
    status_code=201,
    summary="Persist a message sent by user_id to partner_id",
)
async def save_message(
    user_id: str,
    partner_id: str,
    payload: MessageCreate,
    db: DbSession,
) -> Message:
    msg = Message(
        sender_id=user_id,
        receiver_id=partner_id,
        content=payload.content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg
