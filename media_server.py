import os
import json
from pathlib import Path

from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import requests

try:
    from dotenv import load_dotenv  # type: ignore[import]
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None

if load_dotenv:
    load_dotenv()

import analytics_db as db_module

fetch_clips = db_module.fetch_clips
fetch_clip = db_module.fetch_clip
upsert_clip = db_module.upsert_clip

remove_clip = getattr(db_module, "remove_clip", None)
if remove_clip is None:
    def remove_clip(clip_id):
        placeholder = "%s" if getattr(db_module, "USE_POSTGRES", False) else "?"
        query = f"DELETE FROM clips WHERE id = {placeholder}"
        with db_module.db_cursor() as cur:
            cur.execute(query, (clip_id,))

if hasattr(db_module, "update_clip_shot"):
    db_update_clip_shot = db_module.update_clip_shot
else:
    def db_update_clip_shot(clip_id, has_shot, shot_x, shot_y, shot_result, shooter_designation):
        placeholder = "%s" if getattr(db_module, "USE_POSTGRES", False) else "?"
        query = f"""
            UPDATE clips
            SET has_shot = {placeholder}, shot_x = {placeholder}, shot_y = {placeholder},
                shot_result = {placeholder}, shooter = {placeholder}
            WHERE id = {placeholder}
        """
        params = (has_shot, shot_x, shot_y, shot_result, shooter_designation, clip_id)
        with db_module.db_cursor() as cur:
            cur.execute(query, params)

if hasattr(db_module, "clear_clip_shot"):
    db_clear_clip_shot = db_module.clear_clip_shot
else:
    def db_clear_clip_shot(clip_id):
        placeholder = "%s" if getattr(db_module, "USE_POSTGRES", False) else "?"
        query = f"""
            UPDATE clips
            SET has_shot = 'No', shot_x = NULL, shot_y = NULL, shot_result = NULL
            WHERE id = {placeholder}
        """
        with db_module.db_cursor() as cur:
            cur.execute(query, (clip_id,))

# Try to import semantic search - graceful fallback if not available
try:
    from semantic_search import semantic_search, rebuild_embeddings, OPENAI_AVAILABLE
    SEMANTIC_SEARCH_AVAILABLE = True
except ImportError:
    SEMANTIC_SEARCH_AVAILABLE = False
    OPENAI_AVAILABLE = False
    print("⚠️  Semantic search not available. Install: pip install openai numpy")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent
BASE_DIR = PROJECT_ROOT
CLIPS_DIR = PROJECT_ROOT / "Clips"
METADATA_FILE = CLIPS_DIR / "clips_metadata.json"
BRIDGE_CTRL_BASE = "http://127.0.0.1:5000"
BRIDGE_APP_BASE = "http://127.0.0.1:5001"

def derive_video_url(filename, fallback=None):
    for raw in (filename, fallback):
        if not raw:
            continue
        name = Path(raw).name
        clip_path = CLIPS_DIR / name
        if clip_path.exists():
            return f"/legacy/Clips/{name}"
    return None

@app.route('/dashboard')
def dashboard():
    """Serve the main dashboard"""
    return send_from_directory(BASE_DIR, 'CLIP_DASHBOARD_UPDATED.html')

@app.route('/clip_detail.html')
def clip_detail():
    """Serve the clip detail page"""
    return send_from_directory(BASE_DIR, 'clip_detail.html')

@app.route('/clips/<path:filename>')
@app.route('/legacy/Clips/<path:filename>')
def serve_clip(filename):
    """Serve video clip files with proper headers for streaming"""
    full_path = CLIPS_DIR / filename
    if not full_path.exists():
        return jsonify({'error': f'Clip not found: {filename}'}), 404

    response = send_from_directory(CLIPS_DIR, filename, as_attachment=False)
    response.headers['Accept-Ranges'] = 'bytes'
    response.headers['Cache-Control'] = 'no-cache'
    return response

@app.route('/api/clips', methods=['GET', 'POST'])
def api_clips():
    """Get all clips or add a new clip"""
    try:
        # ---- POST: Add a new clip ----
        if request.method == 'POST':
            new_clip = request.get_json()

            # Debug: log the fields we care about
            print(f"🐛 Received clip data - formation: {new_clip.get('formation')}, coverage: {new_clip.get('coverage')}, ball_screen: {new_clip.get('ball_screen')}, off_ball_screen: {new_clip.get('off_ball_screen')}, disruption: {new_clip.get('disruption')}")

            # Save to SQLite database
            try:
                upsert_clip(new_clip)
                print(f"✅ Added clip to SQLite: {new_clip.get('id', 'unknown')}")
            except Exception as e:
                print(f"⚠️  Failed to save to SQLite: {e}")

            # Also save to metadata file as backup
            if METADATA_FILE.exists():
                with open(METADATA_FILE, 'r') as f:
                    data = json.load(f)
            else:
                data = {"clips": []}

            # Append the new clip
            data.setdefault("clips", []).append(new_clip)

            # Save back to file
            with open(METADATA_FILE, 'w') as f:
                json.dump(data, f, indent=2)

            print(f"✅ Added clip: {new_clip.get('id', 'unknown')} to metadata file")
            return jsonify({"ok": True, "message": "Clip added", "clip": transform_db_clip(new_clip)}), 201

        # ---- GET: Return all clips ----
        db_clips = fetch_clips()
        if db_clips:
            transformed = [transform_db_clip(clip) for clip in db_clips]
            return jsonify(transformed)

        if METADATA_FILE.exists():
            with open(METADATA_FILE, 'r') as f:
                data = json.load(f)
            clips = data.get('clips', [])
            transformed = [transform_clip(clip) for clip in clips]
            return jsonify(transformed)

        return jsonify([])

    except Exception as e:
        print("❌ Error in /api/clips:", e)
        return jsonify({"error": str(e)}), 500

def update_metadata_clip(clip_id: str, updates: dict):
    if not METADATA_FILE.exists():
        return

    try:
        with open(METADATA_FILE, 'r') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return

    clips = data.get('clips', [])
    updated = False

    mapping = {
        'notes': 'Notes',
        'result': 'Play Result',
        'shooter': 'Shooter Designation',
        'has_shot': 'Has Shot',
        'shot_x': 'Shot X',
        'shot_y': 'Shot Y',
        'shot_result': 'Shot Result',
        'start_time': 'Start Time',
        'end_time': 'End Time',
        'video_start': 'video_start',
        'video_end': 'video_end',
    }

    for entry in clips:
        if entry.get('id') == clip_id:
            for key, value in updates.items():
                mapped = mapping.get(key)
                if mapped:
                    entry[mapped] = value
            updated = True
            break

    if updated:
        try:
            with open(METADATA_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except OSError:
            pass


def load_metadata_clip(clip_id: str):
    if not METADATA_FILE.exists():
        return None
    try:
        with open(METADATA_FILE, 'r') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None
    for entry in data.get('clips', []):
        if entry.get('id') == clip_id:
            return entry
    return None


@app.route('/api/clip/<clip_id>', methods=['GET', 'PUT', 'DELETE'])
def api_clip_detail(clip_id):
    """Get, update, or delete single clip metadata"""
    if request.method == 'GET':
        try:
            db_record = fetch_clip(clip_id)
            if db_record:
                return jsonify(transform_db_clip(db_record))

            if METADATA_FILE.exists():
                with open(METADATA_FILE, 'r') as f:
                    data = json.load(f)
                clips = data.get('clips', [])
                for clip in clips:
                    if clip.get('id') == clip_id:
                        return jsonify(transform_clip(clip))

            return jsonify({"error": "Clip not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # DELETE clip
    if request.method == 'DELETE':
        try:
            print(f"[DEBUG] Attempting to delete clip: {clip_id}")
            # Delete from database if exists
            db_record = fetch_clip(clip_id)
            print(f"[DEBUG] DB record found: {db_record is not None}")
            if db_record:
                remove_clip(clip_id)
                print(f"[DEBUG] Deleted from database")

            # Delete from metadata file if exists
            if METADATA_FILE.exists():
                print(f"[DEBUG] Metadata file exists: {METADATA_FILE}")
                with open(METADATA_FILE, 'r') as f:
                    data = json.load(f)
                clips = data.get('clips', [])
                print(f"[DEBUG] Found {len(clips)} clips in metadata")
                data['clips'] = [c for c in clips if c.get('id') != clip_id]
                print(f"[DEBUG] After filter: {len(data['clips'])} clips remaining")
                with open(METADATA_FILE, 'w') as f:
                    json.dump(data, f, indent=2)
                print(f"[DEBUG] Metadata file updated")

            print(f"[DEBUG] Delete successful")
            return jsonify({"ok": True, "message": "Clip deleted successfully"})
        except Exception as e:
            print(f"[ERROR] Delete failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": str(e)}), 500

    # PUT update
    if request.method == 'PUT':
        try:
            payload = request.get_json(force=True) or {}
            print(f"[DEBUG] Received PUT payload for clip {clip_id}: {payload}")
            updates = {}

            # Map all possible fields
            field_mapping = {
                'game_id': 'gameId',
                'location': 'location',
                'opponent': 'opponent',
                'result': 'result',
                'notes': 'notes',
                'shooter': 'shooter',
                'quarter': 'quarter',
                'possession': 'possession',
                'situation': 'situation',
                'formation': 'formation',
                'play_name': 'play_name',
                'scout_coverage': 'scout_coverage',
                'action_trigger': 'action_trigger',
                'action_types': 'action_types',
                'action_sequence': 'action_sequence',
                'coverage': 'coverage',
                'ball_screen': 'ball_screen',
                'off_ball_screen': 'off_ball_screen',
                'help_rotation': 'help_rotation',
                'disruption': 'disruption',
                'breakdown': 'breakdown',
                'play_type': 'play_type',
                'possession_result': 'possession_result',
                'defender_designation': 'defender_designation',
                'paint_touches': 'paint_touches',
                'shot_location': 'shot_location',
                'shot_contest': 'shot_contest',
                'shot_result': 'shot_result',
                'shot_quality': 'shot_quality',
                'rebound': 'rebound',
                'points': 'points',
            }

            for api_field, db_field in field_mapping.items():
                if api_field in payload:
                    value = payload.get(api_field)
                    updates[db_field] = value if value is not None else ''

            print(f"[DEBUG] Mapped updates: {updates}")

            if not updates:
                return jsonify({"error": "No valid fields provided"}), 400

            db_record = fetch_clip(clip_id)
            merged = {**(db_record or {}), **updates, 'id': clip_id}

            if db_record:
                upsert_clip(merged)
            update_metadata_clip(clip_id, updates)

            refreshed_db = fetch_clip(clip_id)
            if refreshed_db:
                return jsonify({"ok": True, "clip": transform_db_clip(refreshed_db)})

            refreshed_meta = load_metadata_clip(clip_id)
            if refreshed_meta:
                return jsonify({"ok": True, "clip": transform_clip(refreshed_meta)})

            return jsonify({"ok": True, "clip": {"id": clip_id, **updates}})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

def transform_clip(clip):
    """Transform clip field names to match HTML expectations"""
    location_code = (clip.get('location_code') or clip.get('locationCode') or clip.get('location') or
                     clip.get('Location Code') or clip.get('game_location') or clip.get('gameLocation') or '')
    location_display = (clip.get('location_display') or clip.get('locationDisplay') or clip.get('Location') or
                        clip.get('location_label') or clip.get('locationLabel') or clip.get('Game Location') or '')
    return {
        'id': clip.get('id'),
        'filename': clip.get('filename'),
        'video_url': clip.get('video_url') or derive_video_url(clip.get('filename'), clip.get('path') or clip.get('video_path')),
        'game_num': clip.get('gameId'),
        'opponent': clip.get('opponent'),
        'quarter': clip.get('quarter'),
        'possession': clip.get('possession'),
        'situation': clip.get('situation'),
        'offensive_formation': clip.get('formation'),
        'play_name': clip.get('playName'),
        'scout_coverage': clip.get('scoutCoverage'),
        'action_trigger': clip.get('actionTrigger'),
        'action_types': clip.get('actionTypes'),
        'action_sequence': clip.get('actionSequence'),
        'defensive_coverage': clip.get('coverage'),
        'ball_screen_coverage': clip.get('ballScreen'),
        'offball_screen_coverage': clip.get('offBallScreen'),
        'help_rotation': clip.get('helpRotation'),
        'defensive_disruption': clip.get('disruption'),
        'defensive_breakdown': clip.get('breakdown'),
        'play_result': clip.get('result'),
        'paint_touches': clip.get('paintTouch'),
        'shooter_designation': clip.get('shooter'),
        'shot_location': clip.get('shotLocation'),
        'shot_contest': clip.get('contest'),
        'rebound_outcome': clip.get('rebound'),
        'points': clip.get('points'),
        'has_shot': clip.get('hasShot'),
        'shot_x': clip.get('shotX'),
        'shot_y': clip.get('shotY'),
        'shot_result': clip.get('shotResult'),
        'notes': clip.get('notes'),
        'start_time': clip.get('startTime'),
        'end_time': clip.get('End Time') if clip.get('End Time') else clip.get('endTime'),
        'location': location_code,
        'location_display': location_display,
        'location_code': location_code,
        'game_location': location_code,
        'locationLabel': location_display
    }


def transform_db_clip(clip):
    location_code = (
        clip.get('location_code') or clip.get('location') or clip.get('game_location') or
        clip.get('locationCode') or clip.get('Location Code') or ''
    )
    location_display = (
        clip.get('location_display') or clip.get('location') or clip.get('locationLabel') or
        clip.get('locationDisplay') or clip.get('Location') or ''
    )
    return {
        'id': clip.get('id'),
        'filename': clip.get('filename'),
        'video_url': derive_video_url(clip.get('filename'), clip.get('path')),
        'game_id': clip.get('game_id'),
        'opponent': clip.get('opponent'),
        'game_score': clip.get('game_score'),
        'quarter': clip.get('quarter'),
        'possession': clip.get('possession'),
        'situation': clip.get('situation'),
        'formation': clip.get('formation'),
        'play_name': clip.get('play_name'),
        'scout_coverage': clip.get('scout_coverage'),
        'action_trigger': clip.get('action_trigger'),
        'action_types': clip.get('action_types'),
        'action_sequence': clip.get('action_sequence'),
        'coverage': clip.get('coverage'),
        'ball_screen': clip.get('ball_screen'),
        'off_ball_screen': clip.get('off_ball_screen'),
        'help_rotation': clip.get('help_rotation'),
        'disruption': clip.get('disruption'),
        'breakdown': clip.get('breakdown'),
        'result': clip.get('result'),
        'paint_touch': clip.get('paint_touch'),
        'shooter': clip.get('shooter'),
        'shot_location': clip.get('shot_location'),
        'contest': clip.get('contest'),
        'rebound': clip.get('rebound'),
        'points': clip.get('points'),
        'has_shot': clip.get('has_shot'),
        'shot_x': clip.get('shot_x'),
        'shot_y': clip.get('shot_y'),
        'shot_result': clip.get('shot_result'),
        'notes': clip.get('notes'),
        'start_time': clip.get('start_time'),
        'end_time': clip.get('end_time'),
        'location': location_code,
        'location_display': location_display,
        'location_code': location_code,
        'game_location': location_code,
        'locationLabel': location_display
    }

@app.route('/api/clip/<clip_id>/shot', methods=['PUT', 'DELETE', 'OPTIONS'])
def update_clip_shot(clip_id):
    """Update or delete shot data for a clip"""
    if request.method == 'OPTIONS':
        return jsonify({"ok": True})

    try:
        if request.method == 'PUT':
            # Update shot data
            data = request.get_json()
            has_shot = data.get('has_shot', 'Yes')
            shot_x = data.get('shot_x', '')
            shot_y = data.get('shot_y', '')
            shot_result = data.get('shot_result', '')
            shooter_designation = data.get('shooter_designation', '')

            db_update_clip_shot(
                clip_id=clip_id,
                has_shot=has_shot,
                shot_x=shot_x,
                shot_y=shot_y,
                shot_result=shot_result,
                shooter_designation=shooter_designation,
            )

            update_metadata_clip(clip_id, {
                'has_shot': has_shot,
                'shot_x': shot_x,
                'shot_y': shot_y,
                'shot_result': shot_result,
                'shooter': shooter_designation,
            })

            refreshed_db = fetch_clip(clip_id)
            if refreshed_db:
                return jsonify({"ok": True, "clip": transform_db_clip(refreshed_db)})

            refreshed_meta = load_metadata_clip(clip_id)
            if refreshed_meta:
                return jsonify({"ok": True, "clip": transform_clip(refreshed_meta)})

            return jsonify({
                "ok": True,
                "clip": {
                    'id': clip_id,
                    'has_shot': has_shot,
                    'shot_x': shot_x,
                    'shot_y': shot_y,
                    'shot_result': shot_result,
                }
            })

        elif request.method == 'DELETE':
            # Delete shot data
            db_clear_clip_shot(clip_id)

            update_metadata_clip(clip_id, {
                'has_shot': 'No',
                'shot_x': '',
                'shot_y': '',
                'shot_result': '',
            })

            refreshed_db = fetch_clip(clip_id)
            if refreshed_db:
                return jsonify({"ok": True, "clip": transform_db_clip(refreshed_db)})

            refreshed_meta = load_metadata_clip(clip_id)
            if refreshed_meta:
                return jsonify({"ok": True, "clip": transform_clip(refreshed_meta)})

            return jsonify({"ok": True, "clip": {'id': clip_id, 'has_shot': 'No'}})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "clips_dir": str(CLIPS_DIR),
        "clips_exist": CLIPS_DIR.exists()
    })


def bridge_ctrl_request(method: str, endpoint: str, **kwargs):
    try:
        response = requests.request(method, f"{BRIDGE_CTRL_BASE}{endpoint}", timeout=2, **kwargs)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        raise RuntimeError(str(exc))


def bridge_excel_request(method: str, endpoint: str, **kwargs):
    try:
        response = requests.request(method, f"{BRIDGE_APP_BASE}{endpoint}", timeout=3, **kwargs)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        raise RuntimeError(str(exc))


@app.route('/excel/status')
def excel_status():
    controller = None
    workbook = None
    try:
        controller = bridge_ctrl_request('GET', '/status')
    except RuntimeError as exc:
        controller = {'ok': False, 'error': str(exc)}

    try:
        workbook = bridge_excel_request('GET', '/health')
    except RuntimeError as exc:
        workbook = {'ok': False, 'error': str(exc)}

    return jsonify({'ok': True, 'controller': controller, 'workbook': workbook})


@app.route('/excel/start', methods=['POST'])
def excel_start():
    try:
        data = bridge_ctrl_request('POST', '/start')
        return jsonify({'ok': True, 'status': data})
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 502


@app.route('/excel/stop', methods=['POST'])
def excel_stop():
    try:
        data = bridge_ctrl_request('POST', '/stop')
        return jsonify({'ok': True, 'status': data})
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 502


@app.route('/excel/check-row')
def excel_check_row():
    try:
        row = request.args.get('row', type=int) or 2
        data = bridge_excel_request('GET', '/check_row', params={'row': row})
        return jsonify({'ok': True, 'status': data})
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 502


@app.route('/excel/append', methods=['POST'])
def excel_append():
    try:
        payload = request.get_json(force=True) or {}
        data = bridge_excel_request('POST', '/append', json=payload)
        return jsonify({'ok': True, 'status': data})
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 502


@app.route('/api/search/semantic', methods=['POST'])
def api_semantic_search():
    """
    AI-powered semantic search endpoint.
    POST body: {"query": "find all Horns actions with drop coverage", "top_k": 20}
    """
    if not SEMANTIC_SEARCH_AVAILABLE:
        return jsonify({
            "error": "Semantic search not available. Install: pip install openai numpy",
            "available": False
        }), 501

    if not OPENAI_AVAILABLE:
        return jsonify({
            "error": "OpenAI library not available",
            "available": False
        }), 501

    try:
        data = request.get_json(force=True) or {}
        query = data.get('query', '').strip()
        top_k = data.get('top_k', 20)

        if not query:
            return jsonify({"error": "Query parameter required"}), 400

        results = semantic_search(query, top_k=top_k)

        # Transform results to match frontend expectations
        transformed = [transform_db_clip(clip) for clip in results]

        return jsonify({
            "ok": True,
            "query": query,
            "count": len(transformed),
            "results": transformed
        })

    except ValueError as e:
        return jsonify({"error": str(e), "available": False}), 400
    except Exception as e:
        print(f"❌ Semantic search error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/search/rebuild-embeddings', methods=['POST'])
def api_rebuild_embeddings():
    """
    Rebuild all clip embeddings. Call this when clips are added/updated.
    """
    if not SEMANTIC_SEARCH_AVAILABLE:
        return jsonify({
            "error": "Semantic search not available",
            "available": False
        }), 501

    try:
        result = rebuild_embeddings()
        if result['success']:
            return jsonify({"ok": True, **result})
        else:
            return jsonify({"ok": False, **result}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route('/api/search/status')
def api_search_status():
    """Check if semantic search is available."""
    return jsonify({
        "semantic_search_available": SEMANTIC_SEARCH_AVAILABLE,
        "openai_available": OPENAI_AVAILABLE,
        "api_key_set": bool(os.environ.get('OPENAI_API_KEY'))
    })


@app.get("/")
def root_status():
    return {"status": "OU Defensive Analytics API running"}, 200


@app.get("/api/health")
def api_health():
    return {"ok": True}, 200


@app.get("/api/__routes")
def list_routes():
    from flask import jsonify

    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "rule": str(rule),
            "methods": sorted(list(rule.methods - {"HEAD", "OPTIONS"})),
            "endpoint": rule.endpoint
        })
    return jsonify(sorted(routes, key=lambda r: r["rule"]))


if __name__ == '__main__':
    # Create clips directory if it doesn't exist
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n🎬 Media Server Starting...")
    print(f"📁 Serving clips from: {CLIPS_DIR}")
    print(f"🌐 Server running at: http://127.0.0.1:8000")
    print(f"✋ Press Ctrl+C to stop\n")

    app.run(host='127.0.0.1', port=8000, debug=False)

try:
    from analytics_db import update_clip_shot as _update_clip_shot  # real impl if present
    update_clip_shot = _update_clip_shot
except Exception:
    def update_clip_shot(*args, **kwargs):
        # TODO: replace with real implementation from analytics_db when available
        return None
