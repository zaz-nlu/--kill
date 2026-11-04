"""九点熄灯：账号与云存档服务（Flask + SQLite）。

开发：  flask --app app run -p 8086
上线：  gunicorn -w 2 -b 127.0.0.1:8086 "app:create_app()"，nginx 把 /api/ 转发到它。
数据库路径取环境变量 JIUDIAN_DB，默认 server/data/game.db。
"""
import functools
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time

from flask import Flask, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

TOKEN_TTL = 30 * 86400          # 登录令牌有效期（秒）
MAX_FAILS = 5                   # 连续输错几次后锁定
LOCK_SECONDS = 300
MAX_SAVE_BYTES = 1_000_000
SLOT_COUNT = 10

USERNAME_RE = re.compile(r'^[A-Za-z0-9_一-鿿]{2,20}$')
CHAPTER_RE = re.compile(r'^[a-z][a-z0-9_]{0,15}$')
PASSWORD_MIN, PASSWORD_MAX = 4, 64
MAX_PROFILE_ENTRIES = 50

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until REAL NOT NULL DEFAULT 0,
  created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL,
  slot TEXT NOT NULL,
  data TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, chapter, slot)
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
"""

# 用来在用户不存在时也跑一次哈希，让“没这个人”和“密码错”耗时一致
DUMMY_HASH = generate_password_hash('dummy-password')


def clean_profile(raw):
    """章节进度（通关记录、看过的前情提要）：只留格式正确的部分；根本不是进度时返回 None。"""
    if not isinstance(raw, dict):
        return None
    out = {'cleared': {}, 'seenRecap': {}, 'seenChapterNote': raw.get('seenChapterNote') is True}
    cleared, seen = raw.get('cleared'), raw.get('seenRecap')
    if isinstance(cleared, dict):
        for cid, rec in list(cleared.items())[:MAX_PROFILE_ENTRIES]:
            if (CHAPTER_RE.match(cid) and isinstance(rec, dict) and isinstance(rec.get('ending'), str)
                    and len(rec['ending']) <= 64 and isinstance(rec.get('at'), int) and not isinstance(rec['at'], bool)):
                out['cleared'][cid] = {'ending': rec['ending'], 'at': rec['at']}
    if isinstance(seen, dict):
        out['seenRecap'] = {cid: True for cid, v in list(seen.items())[:MAX_PROFILE_ENTRIES]
                            if CHAPTER_RE.match(cid) and v is True}
    return out


def merge_profiles(a, b):
    """两份进度并成一份：任一边通关过的、看过的都算；同一章两边都通关过，取较晚的一次（和前端一致）。"""
    out = {'cleared': {}, 'seenRecap': {}, 'seenChapterNote': a['seenChapterNote'] or b['seenChapterNote']}
    for p in (a, b):
        for cid, rec in p['cleared'].items():
            if cid not in out['cleared'] or rec['at'] > out['cleared'][cid]['at']:
                out['cleared'][cid] = rec
        out['seenRecap'].update(p['seenRecap'])
    return out


def create_app(db_path=None):
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 2 * MAX_SAVE_BYTES
    app.config['DB_PATH'] = db_path or os.environ.get(
        'JIUDIAN_DB', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'game.db'))
    os.makedirs(os.path.dirname(os.path.abspath(app.config['DB_PATH'])), exist_ok=True)
    init = sqlite3.connect(app.config['DB_PATH'])
    try:
        init.execute('PRAGMA journal_mode=WAL')
        init.executescript(SCHEMA)
    finally:
        init.close()

    def db():
        if 'db' not in g:
            g.db = sqlite3.connect(app.config['DB_PATH'], timeout=10)
            g.db.row_factory = sqlite3.Row
            g.db.execute('PRAGMA foreign_keys=ON')
        return g.db

    @app.teardown_appcontext
    def close_db(_exc):
        con = g.pop('db', None)
        if con is not None:
            con.close()

    def fail(message, status):
        return jsonify(error=message), status

    def body():
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def issue_token(user_id):
        token = secrets.token_urlsafe(32)
        con = db()
        con.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))
        con.execute('INSERT INTO sessions VALUES (?, ?, ?)',
                    (hashlib.sha256(token.encode()).hexdigest(), user_id, time.time() + TOKEN_TTL))
        con.commit()
        return token

    def bearer():
        header = request.headers.get('Authorization', '')
        return header[7:].strip() if header.startswith('Bearer ') else ''

    def authed(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            token = bearer()
            row = token and db().execute(
                'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id '
                'WHERE s.token_hash = ? AND s.expires > ?',
                (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            if not row:
                return fail('登录已过期，请重新登录', 401)
            g.user_id, g.username = row['id'], row['username']
            return view(*args, **kwargs)
        return wrapper

    def credentials():
        data = body()
        username, password = data.get('username'), data.get('password')
        if not isinstance(username, str) or not isinstance(password, str):
            return None, None, fail('请填写用户名和密码', 400)
        return username.strip(), password, None

    @app.post('/api/register')
    def register():
        username, password, err = credentials()
        if err:
            return err
        if not USERNAME_RE.match(username):
            return fail('用户名需 2–20 位，只能用中文、字母、数字、下划线', 400)
        if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
            return fail(f'密码需 {PASSWORD_MIN}–{PASSWORD_MAX} 位', 400)
        con = db()
        try:
            cur = con.execute('INSERT INTO users (username, pw_hash, created) VALUES (?, ?, ?)',
                              (username, generate_password_hash(password), time.time()))
            con.commit()
        except sqlite3.IntegrityError:
            return fail('用户名已被占用', 409)
        return jsonify(username=username, token=issue_token(cur.lastrowid))

    @app.post('/api/login')
    def login():
        username, password, err = credentials()
        if err:
            return err
        con = db()
        user = con.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        if user and user['locked_until'] > time.time():
            return fail('输错次数太多，请 5 分钟后再试', 429)
        if not user:
            check_password_hash(DUMMY_HASH, password)
            return fail('用户名或密码错误', 401)
        if not check_password_hash(user['pw_hash'], password):
            fails = user['fails'] + 1
            locked = time.time() + LOCK_SECONDS if fails >= MAX_FAILS else 0
            con.execute('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?',
                        (0 if locked else fails, locked, user['id']))
            con.commit()
            return fail('用户名或密码错误', 401)
        con.execute('UPDATE users SET fails = 0, locked_until = 0 WHERE id = ?', (user['id'],))
        con.commit()
        return jsonify(username=user['username'], token=issue_token(user['id']))

    @app.post('/api/logout')
    @authed
    def logout():
        db().execute('DELETE FROM sessions WHERE token_hash = ?',
                     (hashlib.sha256(bearer().encode()).hexdigest(),))
        db().commit()
        return jsonify(ok=True)

    @app.get('/api/me')
    @authed
    def me():
        return jsonify(username=g.username)

    # ---- 云存档：一个账号 × 章节 × 槽位（1–10 或 auto）一条 ----

    def slot_ok(chapter, slot):
        return bool(CHAPTER_RE.match(chapter)) and (
            slot == 'auto' or (slot.isdigit() and 1 <= int(slot) <= SLOT_COUNT))

    @app.get('/api/saves')
    @authed
    def list_saves():
        rows = db().execute('SELECT chapter, slot, data, at FROM saves WHERE user_id = ?', (g.user_id,))
        return jsonify(saves=[dict(r) for r in rows])

    @app.put('/api/saves/<chapter>/<slot>')
    @authed
    def put_save(chapter, slot):
        if not slot_ok(chapter, slot):
            return fail('存档位置不对', 400)
        data = body()
        raw, at = data.get('data'), data.get('at')
        if not isinstance(raw, str) or not isinstance(at, int) or isinstance(at, bool):
            return fail('存档内容不对', 400)
        if len(raw.encode()) > MAX_SAVE_BYTES:
            return fail('存档太大', 413)
        try:
            json.loads(raw)
        except ValueError:
            return fail('存档内容不对', 400)
        con = db()
        con.execute(
            'INSERT INTO saves VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, chapter, slot) '
            'DO UPDATE SET data = excluded.data, at = excluded.at',
            (g.user_id, chapter, slot, raw, at))
        con.commit()
        return jsonify(ok=True)

    @app.delete('/api/saves/<chapter>/<slot>')
    @authed
    def delete_save(chapter, slot):
        if not slot_ok(chapter, slot):
            return fail('存档位置不对', 400)
        db().execute('DELETE FROM saves WHERE user_id = ? AND chapter = ? AND slot = ?',
                     (g.user_id, chapter, slot))
        db().commit()
        return jsonify(ok=True)

    # ---- 章节进度：上传的和服务器上的合并后存回，并把合并结果返回 ----

    @app.put('/api/profile')
    @authed
    def put_profile():
        incoming = clean_profile(body().get('profile'))
        if incoming is None:
            return fail('进度内容不对', 400)
        con = db()
        con.execute('BEGIN IMMEDIATE')  # 两个设备同时上传时，后到的等前一个写完再合并
        row = con.execute('SELECT data FROM profiles WHERE user_id = ?', (g.user_id,)).fetchone()
        stored = clean_profile(json.loads(row['data'])) if row else None
        merged = merge_profiles(stored, incoming) if stored else incoming
        con.execute('INSERT INTO profiles VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data',
                    (g.user_id, json.dumps(merged)))
        con.commit()
        return jsonify(profile=merged)

    @app.errorhandler(413)
    def too_large(_e):
        return fail('存档太大', 413)

    return app
