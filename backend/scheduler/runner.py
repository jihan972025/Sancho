import logging
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from ..config import get_config
from ..llm.registry import get_provider_for_model
from ..skills.loader import build_skill_system_prompt
from ..skills.executor import parse_skill_call, execute_skill_call
from .models import ScheduledTask, TaskLog, Notification
from . import storage

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None

DAY_MAP = {
    "mon": "mon", "tue": "tue", "wed": "wed", "thu": "thu",
    "fri": "fri", "sat": "sat", "sun": "sun",
}


def _get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


async def execute_scheduled_task(task_id: str) -> None:
    """Run a scheduled task through the LLM + skill pipeline."""
    task = storage.get_task(task_id)
    if not task or not task.enabled:
        return

    config = get_config()
    model = config.llm.default_model
    if task.model:
        # Use task-specific model only if it's still available
        test_provider = get_provider_for_model(task.model)
        if test_provider:
            model = task.model
        else:
            logger.warning(
                "Scheduled task '%s': model '%s' unavailable, falling back to default '%s'",
                task.name, task.model, model,
            )

    if not model:
        logger.warning("Scheduled task '%s': no model configured", task.name)
        _save_log(task, "No model configured", "error")
        return

    provider = get_provider_for_model(model)
    if not provider:
        logger.warning("Scheduled task '%s': model '%s' not available", task.name, model)
        _save_log(task, f"Model '{model}' is not available", "error")
        return

    messages = [{"role": "user", "content": task.prompt}]

    try:
        skill_prompt = build_skill_system_prompt()

        if skill_prompt is None:
            # No skills — direct LLM call
            result = await provider.complete(messages, model)
        else:
            # Phase 1: detect skill call
            skill_messages = [
                {"role": "system", "content": skill_prompt},
                *messages,
            ]
            phase1_response = await provider.complete(skill_messages, model)
            skill_call = parse_skill_call(phase1_response)

            if not skill_call:
                result = phase1_response
            else:
                # Execute skill
                skill_result = await execute_skill_call(skill_call)

                # Phase 2: final answer with skill result
                phase2_messages = [
                    {"role": "system", "content": (
                        "You are an automated report generator for a scheduled task. "
                        "A real-time search was just performed and the results are provided below. "
                        "RULES:\n"
                        "1. The search results ARE the latest available data. Trust them completely.\n"
                        "2. Extract every available number, date, percentage, and fact from the results.\n"
                        "3. If exact data for today is not in the results, use the MOST RECENT data available and clearly state which date it is from.\n"
                        "4. NEVER say 'I cannot provide' or 'information is unavailable'. Always produce a complete report using the best available data.\n"
                        "5. Format the output cleanly with headers, tables, and bullet points.\n"
                        "6. Answer in the same language as the user's question."
                    )},
                    *messages,
                    {
                        "role": "user",
                        "content": (
                            f"[SEARCH_RESULT]\n{skill_result}\n[/SEARCH_RESULT]\n\n"
                            "Based on the search results above, produce a complete and detailed answer to the original question. "
                            "Use ALL relevant data points from the search results. "
                            "If today's exact data is unavailable, use the most recent available data and note the date."
                        ),
                    },
                ]
                result = await provider.complete(phase2_messages, model)

        # Update task and save log
        _save_log(task, result, "success")
        logger.info("Scheduled task '%s' completed successfully", task.name)

    except Exception as e:
        logger.error("Scheduled task '%s' failed: %s", task.name, e, exc_info=True)
        _save_log(task, str(e), "error")


def _save_log(task: ScheduledTask, result: str, status: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    log = TaskLog(
        id=str(uuid.uuid4()),
        task_id=task.id,
        task_name=task.name,
        executed_at=now,
        result=result,
        status=status,
    )
    storage.add_log(log)

    # Update last_run / last_result on the task
    task.last_run = now
    task.last_result = result[:500] if status == "success" else f"[ERROR] {result[:500]}"
    storage.update_task(task)

    # Create notification if any chat app is enabled
    apps = task.notify_apps
    if status == "success" and (apps.whatsapp or apps.telegram or apps.matrix):
        notif = Notification(
            id=str(uuid.uuid4()),
            task_id=task.id,
            task_name=task.name,
            result=result,
            notify_apps=apps,
            created_at=now,
        )
        storage.add_notification(notif)
        logger.info("Notification queued for task '%s'", task.name)


def _add_job(task: ScheduledTask) -> None:
    scheduler = _get_scheduler()
    job_id = f"task_{task.id}"

    # Remove existing job if present
    existing = scheduler.get_job(job_id)
    if existing:
        existing.remove()

    if not task.enabled:
        return

    if task.schedule_type == "cron":
        day_of_week = ",".join(
            DAY_MAP[d] for d in task.cron_days if d in DAY_MAP
        ) or "mon-sun"
        try:
            tz = ZoneInfo(task.timezone) if task.timezone else None
        except (KeyError, ValueError):
            logger.warning("Invalid timezone '%s' for task '%s', using UTC", task.timezone, task.name)
            tz = None
        scheduler.add_job(
            execute_scheduled_task,
            "cron",
            id=job_id,
            args=[task.id],
            hour=task.cron_hour,
            minute=task.cron_minute,
            day_of_week=day_of_week,
            timezone=tz,
            misfire_grace_time=300,
        )
    elif task.schedule_type == "interval":
        scheduler.add_job(
            execute_scheduled_task,
            "interval",
            id=job_id,
            args=[task.id],
            minutes=task.interval_minutes,
            misfire_grace_time=300,
        )

    logger.info("Scheduled job '%s' (%s)", task.name, task.schedule_type)


def sync_task(task: ScheduledTask) -> None:
    """Create or update the APScheduler job for a task."""
    _add_job(task)


def remove_task(task_id: str) -> None:
    """Remove the APScheduler job for a task."""
    scheduler = _get_scheduler()
    job_id = f"task_{task_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        existing.remove()


def start_scheduler() -> None:
    """Start the scheduler and load all enabled tasks."""
    scheduler = _get_scheduler()
    tasks = storage.get_tasks()
    for task in tasks:
        if task.enabled:
            _add_job(task)
    scheduler.start()
    logger.info("Scheduler started with %d tasks", len([t for t in tasks if t.enabled]))


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
    _scheduler = None
