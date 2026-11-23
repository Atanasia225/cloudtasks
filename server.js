import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const VERSION = process.env.APP_VERSION || 'dev';
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const COLS = 'id, title, description, done, created_at';

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function validCode(req, res, next) {
  if (!CODE_RE.test(req.params.code)) {
    return res.status(400).json({ error: 'Невірний код списку' });
  }
  next();
}

// Повертає очищений текст або undefined, якщо значення некоректне
function parseTitle(v) {
  const t = String(v ?? '').trim();
  return t && t.length <= 200 ? t : undefined;
}
function parseDesc(v) {
  const t = String(v ?? '').trim();
  return t.length <= 1000 ? t : undefined;
}

app.get('/health', (req, res) => res.send('ok'));
app.get('/api/version', (req, res) => res.json({ version: VERSION }));

app.post('/api/lists', (req, res) => {
  res.status(201).json({ code: crypto.randomBytes(16).toString('base64url') });
});

app.get('/api/lists/:code/tasks', validCode, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tasks WHERE list_code = $1 ORDER BY id DESC`,
    [req.params.code]
  );
  res.json(rows);
}));

app.post('/api/lists/:code/tasks', validCode, wrap(async (req, res) => {
  const title = parseTitle(req.body?.title);
  const description = parseDesc(req.body?.description);
  if (title === undefined) {
    return res.status(400).json({ error: 'Назва має бути від 1 до 200 символів' });
  }
  if (description === undefined) {
    return res.status(400).json({ error: 'Опис має бути не довшим за 1000 символів' });
  }
  const { rows } = await pool.query(
    `INSERT INTO tasks (list_code, title, description) VALUES ($1, $2, $3) RETURNING ${COLS}`,
    [req.params.code, title, description]
  );
  res.status(201).json(rows[0]);
}));

// Часткове оновлення: done, title, description (будь-яка комбінація)
app.patch('/api/lists/:code/tasks/:id', validCode, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Невірний id' });

  const sets = [];
  const vals = [];

  if ('done' in body) {
    if (typeof body.done !== 'boolean') return res.status(400).json({ error: 'done має бути true/false' });
    vals.push(body.done); sets.push(`done = $${vals.length}`);
  }
  if ('title' in body) {
    const t = parseTitle(body.title);
    if (t === undefined) return res.status(400).json({ error: 'Назва має бути від 1 до 200 символів' });
    vals.push(t); sets.push(`title = $${vals.length}`);
  }
  if ('description' in body) {
    const d = parseDesc(body.description);
    if (d === undefined) return res.status(400).json({ error: 'Опис має бути не довшим за 1000 символів' });
    vals.push(d); sets.push(`description = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Нічого оновлювати' });

  vals.push(id, req.params.code);
  const { rows } = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND list_code = $${vals.length} RETURNING ${COLS}`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Завдання не знайдено' });
  res.json(rows[0]);
}));

app.delete('/api/lists/:code/tasks/:id', validCode, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Невірний id' });
  const { rowCount } = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND list_code = $2',
    [id, req.params.code]
  );
  if (!rowCount) return res.status(404).json({ error: 'Завдання не знайдено' });
  res.status(204).end();
}));

app.get('/l/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Помилка:', err.message);
  res.status(500).json({ error: 'Помилка сервера' });
});

// Схема і зворотно сумісна міграція (стара версія додатка нові колонки ігнорує)
await pool.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL PRIMARY KEY,
    list_code   TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    done        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks (list_code);
`);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Сервер працює: http://localhost:${port} (версія ${VERSION})`));