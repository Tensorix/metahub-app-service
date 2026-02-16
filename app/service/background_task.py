# app/service/background_task.py

"""Background task service for managing async operations."""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional, Callable, Any
from uuid import UUID

from loguru import logger
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.model.background_task import BackgroundTask
from app.db.model.message import Message
from app.db.session import SessionLocal


# Global thread pool for background tasks
_executor: Optional[ThreadPoolExecutor] = None


def get_executor() -> ThreadPoolExecutor:
    """Get or create the global thread pool executor."""
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="bg_task_")
    return _executor


def shutdown_executor():
    """Shutdown the thread pool executor."""
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=False)
        _executor = None


class BackgroundTaskService:
    """Service for managing background tasks."""

    @staticmethod
    def create_task(
        db: Session,
        user_id: UUID,
        task_type: str,
        session_id: Optional[UUID] = None,
        total_items: int = 0,
        params: Optional[dict] = None,
    ) -> BackgroundTask:
        """Create a new background task."""
        task = BackgroundTask(
            user_id=user_id,
            task_type=task_type,
            session_id=session_id,
            total_items=total_items,
            params=params or {},
            status="pending",
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        logger.info(f"Created background task {task.id} type={task_type}")
        return task

    @staticmethod
    def get_task(db: Session, task_id: UUID) -> Optional[BackgroundTask]:
        """Get a task by ID."""
        return db.query(BackgroundTask).filter(BackgroundTask.id == task_id).first()

    @staticmethod
    def get_user_tasks(
        db: Session,
        user_id: UUID,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        limit: int = 20,
    ) -> list[BackgroundTask]:
        """Get tasks for a user."""
        query = db.query(BackgroundTask).filter(BackgroundTask.user_id == user_id)
        if status:
            query = query.filter(BackgroundTask.status == status)
        if task_type:
            query = query.filter(BackgroundTask.task_type == task_type)
        return query.order_by(BackgroundTask.created_at.desc()).limit(limit).all()

    @staticmethod
    def get_session_tasks(
        db: Session,
        session_id: UUID,
        user_id: UUID,
        status: Optional[str] = None,
    ) -> list[BackgroundTask]:
        """Get tasks for a session."""
        query = db.query(BackgroundTask).filter(
            BackgroundTask.session_id == session_id,
            BackgroundTask.user_id == user_id,
        )
        if status:
            query = query.filter(BackgroundTask.status == status)
        return query.order_by(BackgroundTask.created_at.desc()).all()

    @staticmethod
    def update_task_status(
        db: Session,
        task_id: UUID,
        status: str,
        error: Optional[str] = None,
        result: Optional[str] = None,
    ):
        """Update task status."""
        task = db.query(BackgroundTask).filter(BackgroundTask.id == task_id).first()
        if task:
            task.status = status
            if status == "running" and not task.started_at:
                task.started_at = datetime.utcnow()
            if status in ("completed", "failed", "cancelled"):
                task.completed_at = datetime.utcnow()
            if error:
                task.error = error
            if result:
                task.result = result
            db.commit()

    @staticmethod
    def update_task_progress(
        db: Session,
        task_id: UUID,
        processed_items: int,
        failed_items: int = 0,
    ):
        """Update task progress."""
        task = db.query(BackgroundTask).filter(BackgroundTask.id == task_id).first()
        if task:
            task.processed_items = processed_items
            task.failed_items = failed_items
            db.commit()

    @staticmethod
    def cancel_task(db: Session, task_id: UUID, user_id: UUID) -> bool:
        """Cancel a task if it's still pending or running."""
        task = db.query(BackgroundTask).filter(
            BackgroundTask.id == task_id,
            BackgroundTask.user_id == user_id,
        ).first()
        if task and task.status in ("pending", "running"):
            task.status = "cancelled"
            task.completed_at = datetime.utcnow()
            db.commit()
            logger.info(f"Cancelled background task {task_id}")
            return True
        return False


def run_task_in_background(task_fn: Callable, task_id: UUID, *args, **kwargs):
    """Submit a task to run in the background thread pool."""
    executor = get_executor()
    
    def wrapper():
        try:
            task_fn(task_id, *args, **kwargs)
        except Exception as e:
            logger.exception(f"Background task {task_id} failed: {e}")
            # Update task status to failed
            with SessionLocal() as db:
                BackgroundTaskService.update_task_status(
                    db, task_id, "failed", error=str(e)
                )
    
    executor.submit(wrapper)
    logger.info(f"Submitted background task {task_id} to thread pool")


# ============ Task Executors ============


def execute_index_session_task(
    task_id: UUID,
    user_id: UUID,
    session_id: UUID,
    skip_embedding: bool = False,
):
    """Execute session indexing in background."""
    from app.service.search_indexer import SearchIndexerService
    
    with SessionLocal() as db:
        try:
            # Mark task as running
            BackgroundTaskService.update_task_status(db, task_id, "running")
            
            # Check if task was cancelled
            task = BackgroundTaskService.get_task(db, task_id)
            if not task or task.status == "cancelled":
                return
            
            # Get messages to index
            messages = db.query(Message).filter(
                Message.session_id == session_id,
                Message.user_id == user_id,
            ).all()
            
            total = len(messages)
            if total == 0:
                BackgroundTaskService.update_task_status(
                    db, task_id, "completed", result="No messages to index"
                )
                return
            
            # Update total count
            task = BackgroundTaskService.get_task(db, task_id)
            if task:
                task.total_items = total
                db.commit()
            
            # Index messages
            indexer = SearchIndexerService()
            processed = 0
            failed = 0
            
            for message in messages:
                # Check for cancellation periodically
                if processed % 100 == 0:
                    task = BackgroundTaskService.get_task(db, task_id)
                    if task and task.status == "cancelled":
                        logger.info(f"Task {task_id} was cancelled")
                        return
                
                try:
                    indexer.index_message(db, message, skip_embedding=skip_embedding)
                    processed += 1
                except Exception as e:
                    logger.error(f"Failed to index message {message.id}: {e}")
                    failed += 1
                    processed += 1
                
                # Update progress every 50 messages
                if processed % 50 == 0:
                    BackgroundTaskService.update_task_progress(db, task_id, processed, failed)
            
            # Final update
            BackgroundTaskService.update_task_progress(db, task_id, processed, failed)
            result = f"Indexed {processed - failed}/{total} messages"
            if failed > 0:
                result += f" ({failed} failed)"
            BackgroundTaskService.update_task_status(db, task_id, "completed", result=result)
            logger.info(f"Task {task_id} completed: {result}")
            
        except Exception as e:
            logger.exception(f"Task {task_id} failed: {e}")
            BackgroundTaskService.update_task_status(db, task_id, "failed", error=str(e))


def execute_backfill_embeddings_task(
    task_id: UUID,
    user_id: UUID,
    session_id: Optional[UUID] = None,
    batch_size: int = 100,
):
    """Execute embedding backfill in background."""
    from app.service.search_indexer import SearchIndexerService
    
    with SessionLocal() as db:
        try:
            # Mark task as running
            BackgroundTaskService.update_task_status(db, task_id, "running")
            
            indexer = SearchIndexerService()
            
            # Get total count first
            total = indexer.get_missing_embeddings_count(db, user_id, session_id)
            
            task = BackgroundTaskService.get_task(db, task_id)
            if task:
                task.total_items = total
                db.commit()
            
            if total == 0:
                BackgroundTaskService.update_task_status(
                    db, task_id, "completed", result="No embeddings to generate"
                )
                return
            
            # Process in batches
            processed = 0
            failed = 0
            
            while True:
                # Check for cancellation
                task = BackgroundTaskService.get_task(db, task_id)
                if task and task.status == "cancelled":
                    logger.info(f"Task {task_id} was cancelled")
                    return
                
                result = indexer.backfill_embeddings(
                    db, user_id, session_id, batch_size=batch_size
                )
                
                if result["processed"] == 0:
                    break
                
                processed += result["success"]
                failed += result["failed"]
                
                BackgroundTaskService.update_task_progress(db, task_id, processed, failed)
            
            result_msg = f"Generated {processed}/{total} embeddings"
            if failed > 0:
                result_msg += f" ({failed} failed)"
            BackgroundTaskService.update_task_status(db, task_id, "completed", result=result_msg)
            logger.info(f"Task {task_id} completed: {result_msg}")
            
        except Exception as e:
            logger.exception(f"Task {task_id} failed: {e}")
            BackgroundTaskService.update_task_status(db, task_id, "failed", error=str(e))


def execute_vectorize_collection_task(
    task_id: UUID,
    user_id: UUID,
    collection_id: UUID,
):
    """Legacy: Execute collection vectorization in background."""
    execute_vectorize_folder_task(task_id, user_id=user_id, folder_id=collection_id)


def execute_vectorize_folder_task(
    task_id: UUID,
    user_id: UUID,
    folder_id: UUID,
):
    """Execute folder vectorization in background (knowledge base)."""
    from app.service.knowledge import KnowledgeService

    with SessionLocal() as db:
        try:
            BackgroundTaskService.update_task_status(db, task_id, "running")

            task = BackgroundTaskService.get_task(db, task_id)
            if not task or task.status == "cancelled":
                return

            svc = KnowledgeService()
            result = svc.vectorize_folder(db, folder_id, user_id)

            if result.get("status") == "error":
                BackgroundTaskService.update_task_status(
                    db, task_id, "failed", error=result.get("error", "Unknown error")
                )
                return

            total = result.get("total", 0)
            processed = result.get("processed", 0)
            failed = result.get("failed", 0)
            BackgroundTaskService.update_task_progress(db, task_id, processed, failed)
            result_msg = f"Vectorized {processed}/{total} items"
            if failed > 0:
                result_msg += f" ({failed} failed)"
            BackgroundTaskService.update_task_status(
                db, task_id, "completed", result=result_msg
            )
            logger.info(f"Task {task_id} completed: {result_msg}")

        except Exception as e:
            logger.exception(f"Task {task_id} failed: {e}")
            BackgroundTaskService.update_task_status(
                db, task_id, "failed", error=str(e)
            )


def execute_reindex_session_task(
    task_id: UUID,
    user_id: UUID,
    session_id: UUID,
    skip_embedding: bool = False,
):
    """Execute session reindexing in background."""
    from app.service.search_indexer import SearchIndexerService
    
    with SessionLocal() as db:
        try:
            # Mark task as running
            BackgroundTaskService.update_task_status(db, task_id, "running")
            
            indexer = SearchIndexerService()
            
            # Get message count
            total = db.query(Message).filter(
                Message.session_id == session_id,
                Message.user_id == user_id,
            ).count()
            
            task = BackgroundTaskService.get_task(db, task_id)
            if task:
                task.total_items = total
                db.commit()
            
            if total == 0:
                BackgroundTaskService.update_task_status(
                    db, task_id, "completed", result="No messages to reindex"
                )
                return
            
            # Reindex
            result = indexer.reindex(
                db, user_id, session_id, skip_embedding=skip_embedding
            )
            
            result_msg = f"Reindexed {result['success']}/{result['total']} messages"
            if result["failed"] > 0:
                result_msg += f" ({result['failed']} failed)"
            
            BackgroundTaskService.update_task_progress(
                db, task_id, result["total"], result["failed"]
            )
            BackgroundTaskService.update_task_status(db, task_id, "completed", result=result_msg)
            logger.info(f"Task {task_id} completed: {result_msg}")
            
        except Exception as e:
            logger.exception(f"Task {task_id} failed: {e}")
            BackgroundTaskService.update_task_status(db, task_id, "failed", error=str(e))
