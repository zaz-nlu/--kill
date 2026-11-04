# 账号与云存档服务

Flask + SQLite。注册只要用户名 + 密码；每个账号的存档（每章 10 个手动槽 + 1 个自动档）存在服务器上。

## 本地开发
```
py -3 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -r requirements-dev.txt
.venv\Scripts\python -m pytest            # 测试
.venv\Scripts\python -m flask --app app run -p 8086
```
`npm run dev` 会把 `/api` 转发到 8086。

## 上线
```
pip install -r requirements.txt
gunicorn -w 2 -b 127.0.0.1:8086 "app:create_app()"
```
nginx 站点配置里加：
```
location /api/ { proxy_pass http://127.0.0.1:8086; }
```
数据库默认在 `server/data/game.db`（已 gitignore），可用环境变量 `JIUDIAN_DB` 改路径。重新部署网页时不要覆盖 `server/data/`。

## 接口
`POST /api/register|login`（`{username,password}` → `{username,token}`）、`POST /api/logout`、`GET /api/me`、
`GET /api/saves`、`PUT|DELETE /api/saves/<章节>/<槽位>`（槽位 `1`–`10` 或 `auto`）。除注册登录外都带 `Authorization: Bearer <token>`。
