from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from math import ceil

from app.db.model.activity import Activity
from app.schema.activity import ActivityCreate, ActivityUpdate, ActivityListQuery
from app.service.activity_relation_service import ActivityRelationService


class ActivityService:
    """Activity 服务类"""

    @staticmethod
    def create_activity(db: Session, activity_data: ActivityCreate, user_id: UUID) -> Activity:
        """创建活动（带用户隔离）"""
        data = activity_data.model_dump(exclude={"relations"})
        db_activity = Activity(user_id=user_id, **data)
        db.add(db_activity)
        db.flush()
        if activity_data.relations:
            ActivityRelationService.set_relations(
                db, db_activity.id, user_id,
                [{"type": r.type, "id": r.id} for r in activity_data.relations],
            )
        db.commit()
        db.refresh(db_activity)
        return db_activity

    @staticmethod
    def get_activity(db: Session, activity_id: UUID, user_id: UUID, include_deleted: bool = False) -> Optional[Activity]:
        """根据ID获取活动（带用户隔离）"""
        query = db.query(Activity).filter(
            Activity.id == activity_id,
            Activity.user_id == user_id
        )
        if not include_deleted:
            query = query.filter(Activity.is_deleted == False)
        return query.first()

    @staticmethod
    def get_activities(db: Session, query_params: ActivityListQuery, user_id: UUID) -> tuple[list[Activity], int]:
        """获取活动列表（带用户隔离）"""
        query = db.query(Activity).filter(Activity.user_id == user_id)
        
        # 构建筛选条件
        filters = []
        
        if not query_params.is_deleted:
            filters.append(Activity.is_deleted == False)
        
        if query_params.type:
            filters.append(Activity.type == query_params.type)
        
        if query_params.priority_min is not None:
            filters.append(Activity.priority >= query_params.priority_min)
        
        if query_params.priority_max is not None:
            filters.append(Activity.priority <= query_params.priority_max)
        
        if query_params.tags:
            # 数组标签筛选，匹配任意给定标签
            filters.append(Activity.tags.overlap(query_params.tags))
        
        if filters:
            query = query.filter(and_(*filters))
        
        # 获取总数
        total = query.count()
        
        # 分页
        offset = (query_params.page - 1) * query_params.size
        activities = query.order_by(Activity.priority.desc(), Activity.created_at.desc())\
                         .offset(offset)\
                         .limit(query_params.size)\
                         .all()
        
        return activities, total

    @staticmethod
    def update_activity(db: Session, activity_id: UUID, activity_data: ActivityUpdate, user_id: UUID) -> Optional[Activity]:
        """更新活动（带用户隔离和版本控制）"""
        db_activity = ActivityService.get_activity(db, activity_id, user_id)
        if not db_activity:
            return None

        update_data = activity_data.model_dump(exclude_unset=True)
        relations = update_data.pop("relations", None)
        for field, value in update_data.items():
            setattr(db_activity, field, value)

        if relations is not None:
            refs = [
                {"type": r["type"], "id": r["id"]}
                if isinstance(r, dict)
                else {"type": r.type, "id": r.id}
                for r in relations
            ]
            ActivityRelationService.set_relations(db, activity_id, user_id, refs)

        db_activity.version += 1
        db.commit()
        db.refresh(db_activity)
        return db_activity

    @staticmethod
    def delete_activity(db: Session, activity_id: UUID, user_id: UUID, soft_delete: bool = True) -> bool:
        """删除活动（带用户隔离）"""
        db_activity = ActivityService.get_activity(db, activity_id, user_id)
        if not db_activity:
            return False
        
        if soft_delete:
            # 软删除
            db_activity.is_deleted = True
            db_activity.version += 1
            db.commit()
        else:
            # 硬删除
            db.delete(db_activity)
            db.commit()
        
        return True

    @staticmethod
    def restore_activity(db: Session, activity_id: UUID, user_id: UUID) -> Optional[Activity]:
        """恢复已删除的活动（带用户隔离）"""
        db_activity = ActivityService.get_activity(db, activity_id, user_id, include_deleted=True)
        if not db_activity or not db_activity.is_deleted:
            return None
        
        db_activity.is_deleted = False
        db_activity.version += 1
        db.commit()
        db.refresh(db_activity)
        return db_activity

    @staticmethod
    def create_activity_from_event(db: Session, event_id: UUID, event_type: str, event_data: dict, user_id: UUID) -> Activity:
        """根据事件自动创建对应的活动（带用户隔离）"""
        # 根据事件类型生成活动名称
        activity_name = f"{event_type.title()} Activity - {event_id}"
        
        # 如果事件数据中包含 name 字段，使用它作为活动名称的一部分
        if 'name' in event_data and event_data['name']:
            activity_name = f"{event_type.title()}: {event_data['name']}"
        
        # 根据事件类型设置默认优先级
        priority_map = {
            "ping": 1,
            "alert": 5,
            "notification": 3,
            "reminder": 4
        }
        default_priority = priority_map.get(event_type, 2)
        
        # 创建活动
        activity = Activity(
            user_id=user_id,
            type=event_type,
            source_type="event",
            source_id=str(event_id),
            name=activity_name,
            priority=default_priority,
            comments=f"Auto-created from {event_type} event {event_id}",
            tags=[event_type, "auto-created"]
        )
        
        db.add(activity)
        db.commit()
        db.refresh(activity)
        return activity