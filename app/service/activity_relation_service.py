"""Activity relation service — CRUD and resolution for activity_relation."""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.model.activity import Activity
from app.db.model.activity_relation import ActivityRelation
from app.db.model.session import Session as SessionModel
from app.db.model.topic import Topic
from app.db.model.knowledge_node import KnowledgeNode


RelationRefDict = dict  # {"type": "session"|"topic"|"node", "id": str}


class ActivityRelationService:
    @staticmethod
    def set_relations(
        db: Session,
        activity_id: UUID,
        user_id: UUID,
        relations: list[RelationRefDict],
    ) -> None:
        """Replace all relations for an activity. Validates activity ownership."""
        activity = db.query(Activity).filter(
            Activity.id == activity_id,
            Activity.user_id == user_id,
        ).first()
        if not activity:
            return

        # Soft-delete existing relations
        db.query(ActivityRelation).filter(
            ActivityRelation.activity_id == activity_id,
        ).update({"is_deleted": True})

        valid_types = {"session", "topic", "node"}
        seen: set[tuple[str, str]] = set()
        for r in relations or []:
            t = (r.get("type") or "").strip().lower()
            tid = (r.get("id") or "").strip()
            if t not in valid_types or not tid or (t, tid) in seen:
                continue
            seen.add((t, tid))
            rel = ActivityRelation(
                activity_id=activity_id,
                target_type=t,
                target_id=tid,
            )
            db.add(rel)

    @staticmethod
    def get_relations(
        db: Session,
        activity_id: UUID,
        user_id: UUID,
    ) -> list[ActivityRelation]:
        """Get non-deleted relations for an activity."""
        activity = db.query(Activity).filter(
            Activity.id == activity_id,
            Activity.user_id == user_id,
        ).first()
        if not activity:
            return []
        return [
            r for r in (activity.relations or [])
            if not r.is_deleted
        ]

    @staticmethod
    def resolve_relations(
        db: Session,
        user_id: UUID,
        relations: list[ActivityRelation],
    ) -> list[dict]:
        """Resolve ActivityRelation list to [{type, id, name, session_name?, session_id?, node_type?}]"""
        if not relations:
            return []
        result = []
        topic_ids = []
        session_ids = []
        node_ids = []
        for r in relations:
            if r.target_type == "topic":
                topic_ids.append(r.target_id)
            elif r.target_type == "session":
                session_ids.append(r.target_id)
            elif r.target_type == "node":
                node_ids.append(r.target_id)

        sessions_map: dict[str, dict] = {}
        if session_ids:
            for s in db.query(SessionModel).filter(
                SessionModel.id.in_([UUID(x) for x in session_ids if _is_uuid(x)]),
                SessionModel.user_id == user_id,
            ).all():
                sessions_map[str(s.id)] = {"name": s.name or "(未命名)", "id": str(s.id)}

        topics_map: dict[str, dict] = {}
        if topic_ids:
            for t in db.query(Topic).filter(
                Topic.id.in_([UUID(x) for x in topic_ids if _is_uuid(x)]),
                Topic.user_id == user_id,
                Topic.is_deleted == False,
            ).all():
                sess = db.query(SessionModel).filter(
                    SessionModel.id == t.session_id,
                    SessionModel.user_id == user_id,
                ).first()
                topics_map[str(t.id)] = {
                    "name": t.name or "(未命名)",
                    "id": str(t.id),
                    "session_id": str(t.session_id),
                    "session_name": (sess.name or "(未命名)") if sess else "(未命名)",
                }

        nodes_map: dict[str, dict] = {}
        if node_ids:
            for n in db.query(KnowledgeNode).filter(
                KnowledgeNode.id.in_([UUID(x) for x in node_ids if _is_uuid(x)]),
                KnowledgeNode.user_id == user_id,
                KnowledgeNode.is_deleted == False,
            ).all():
                nodes_map[str(n.id)] = {
                    "name": n.name,
                    "id": str(n.id),
                    "node_type": n.node_type,
                }

        for r in relations:
            if r.target_type == "session":
                info = sessions_map.get(r.target_id)
                if info:
                    result.append({
                        "type": "session",
                        "id": r.target_id,
                        "name": info["name"],
                        "session_id": info.get("id"),
                        "session_name": info.get("name"),
                        "node_type": None,
                    })
                else:
                    result.append({
                        "type": "session",
                        "id": r.target_id,
                        "name": "(已删除)",
                        "session_id": None,
                        "session_name": None,
                        "node_type": None,
                    })
            elif r.target_type == "topic":
                info = topics_map.get(r.target_id)
                if info:
                    result.append({
                        "type": "topic",
                        "id": r.target_id,
                        "name": info["name"],
                        "session_id": info.get("session_id"),
                        "session_name": info.get("session_name"),
                        "node_type": None,
                    })
                else:
                    result.append({
                        "type": "topic",
                        "id": r.target_id,
                        "name": "(已删除)",
                        "session_id": None,
                        "session_name": None,
                        "node_type": None,
                    })
            elif r.target_type == "node":
                info = nodes_map.get(r.target_id)
                if info:
                    result.append({
                        "type": "node",
                        "id": r.target_id,
                        "name": info["name"],
                        "session_id": None,
                        "session_name": None,
                        "node_type": info.get("node_type"),
                    })
                else:
                    result.append({
                        "type": "node",
                        "id": r.target_id,
                        "name": "(已删除)",
                        "session_id": None,
                        "session_name": None,
                        "node_type": None,
                    })
        return result


def _is_uuid(s: str) -> bool:
    try:
        UUID(s)
        return True
    except (ValueError, TypeError):
        return False
