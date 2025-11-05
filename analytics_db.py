import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "analytics.sqlite"

CREATE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        game_id INTEGER,
        canonical_game_id TEXT,
        canonical_clip_id TEXT,
        opponent TEXT,
        opponent_slug TEXT,
        location TEXT,
        game_score TEXT,
        quarter INTEGER,
        possession INTEGER,
        situation TEXT,
        formation TEXT,
        play_name TEXT,
        scout_coverage TEXT,
        action_trigger TEXT,
        action_types TEXT,
        action_sequence TEXT,
        coverage TEXT,
        ball_screen TEXT,
        off_ball_screen TEXT,
        help_rotation TEXT,
        disruption TEXT,
        breakdown TEXT,
        result TEXT,
        paint_touch TEXT,
        shooter TEXT,
        shot_location TEXT,
        contest TEXT,
        rebound TEXT,
        points INTEGER,
        has_shot TEXT,
        shot_x TEXT,
        shot_y TEXT,
        shot_result TEXT,
        notes TEXT,
        start_time TEXT,
        end_time TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_clips_game ON clips (game_id)",
    "CREATE INDEX IF NOT EXISTS idx_clips_canonical_game ON clips (canonical_game_id)",
    "CREATE INDEX IF NOT EXISTS idx_clips_canonical_clip ON clips (canonical_clip_id)",
    """
    CREATE TABLE IF NOT EXISTS comm_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
        start REAL NOT NULL,
        "end" REAL NOT NULL,
        duration REAL NOT NULL,
        peak_dbfs REAL,
        rms REAL,
        rms_dbfs REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_comm_clip ON comm_segments (clip_id)",
    "CREATE INDEX IF NOT EXISTS idx_comm_start ON comm_segments (clip_id, start)",
]


def _dict_factory(cursor: sqlite3.Cursor, row: sqlite3.Row) -> Dict[str, Any]:
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = _dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        yield conn.cursor()
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db_cursor() as cur:
        for stmt in CREATE_STATEMENTS:
            cur.execute(stmt)


def upsert_clip(clip: Dict[str, Any]) -> None:
    """
    Insert or update a clip record. The dict should contain all normalized fields.
    """
    normalized = clip.copy()
    now = datetime.utcnow().isoformat()
    normalized.setdefault("created_at", now)
    normalized["updated_at"] = now

    columns = [
        "id",
        "filename",
        "path",
        "game_id",
        "canonical_game_id",
        "canonical_clip_id",
        "opponent",
        "opponent_slug",
        "location",
        "game_score",
        "quarter",
        "possession",
        "situation",
        "formation",
        "play_name",
        "scout_coverage",
        "action_trigger",
        "action_types",
        "action_sequence",
        "coverage",
        "ball_screen",
        "off_ball_screen",
        "help_rotation",
        "disruption",
        "breakdown",
        "result",
        "paint_touch",
        "shooter",
        "shot_location",
        "contest",
        "rebound",
        "points",
        "has_shot",
        "shot_x",
        "shot_y",
        "shot_result",
        "notes",
        "start_time",
        "end_time",
        "created_at",
        "updated_at",
    ]

    placeholders = ", ".join("?" for _ in columns)
    assignments = ", ".join(f"{col}=excluded.{col}" for col in columns if col not in {"id", "created_at"})

    values = [normalized.get(col) for col in columns]

    with db_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO clips ({", ".join(columns)})
            VALUES ({placeholders})
            ON CONFLICT(id) DO UPDATE SET {assignments}
            """,
            values,
        )


def upsert_comm_segments(clip_id: str, segments: Iterable[Dict[str, Any]]) -> None:
    rows = [
        (
            clip_id,
            float(seg["start"]),
            float(seg["end"]),
            float(seg.get("duration", seg["end"] - seg["start"])),
            float(seg.get("peak_dbfs")) if seg.get("peak_dbfs") is not None else None,
            float(seg.get("rms")) if seg.get("rms") is not None else None,
            float(seg.get("rms_dbfs")) if seg.get("rms_dbfs") is not None else None,
        )
        for seg in segments
    ]
    with db_cursor() as cur:
        cur.execute("DELETE FROM comm_segments WHERE clip_id = ?", (clip_id,))
        cur.executemany(
            """
            INSERT INTO comm_segments (clip_id, start, "end", duration, peak_dbfs, rms, rms_dbfs)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def fetch_clips() -> List[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT * FROM clips ORDER BY created_at DESC")
        return cur.fetchall()


def fetch_clip(clip_id: str) -> Optional[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        return cur.fetchone()


def fetch_comm_segments(clip_id: str) -> List[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, clip_id, start, "end", duration, peak_dbfs, rms, rms_dbfs, created_at
            FROM comm_segments
            WHERE clip_id = ?
            ORDER BY start
            """,
            (clip_id,),
        )
        return cur.fetchall()


def remove_clip(clip_id: str) -> None:
    with db_cursor() as cur:
        cur.execute("DELETE FROM clips WHERE id = ?", (clip_id,))


def import_clips(records: Iterable[Dict[str, Any]]) -> None:
    for record in records:
        upsert_clip(record)


init_db()
