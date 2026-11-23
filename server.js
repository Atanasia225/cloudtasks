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

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Обгортка, щоб помилки async-функцій потрапляли в обробник помилок
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Перевірка формату коду списку
function validCode(req, res, next) {
  if (!CODE_RE.test(req.params.code)) {
    return res.status(400).json({ error: 'Невірний код списку' });
  }
  next();
}

// Службові адреси
app.get('/health', (req, res) => res.send('ok'));
app.get('/api/version', (req, res) => res.json({ version: VERSION }));

// Створити новий список: повертає випадковий код
app.post('/api/lists', (req, res) => {
  const code = crypto.randomBytes(16).toString('base64url');
  res.status(201).json({ code });
});

// Отримати завдання списку
app.get('/api/lists/:code/tasks', validCode, wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, title, done FROM tasks WHERE list_code = $1 ORDER BY id',
    [req.params.code]
  );
  res.json(rows);
}));

// Додати завдання
app.post('/api/lists/:code/tasks', validCode, wrap(async (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title || title.length > 200) {
    return res.status(400).json({ error: 'Назва має бути від 1 до 200 символів' });
  }
  const { rows } = await pool.query(
    'INSERT INTO tasks (list_code, title) VALUES ($1, $2) RETURNING id, title, done',
    [req.params.code, title]
  );
  res.status(201).json(rows[0]);
}));

// Позначити виконаним або невиконаним
app.patch('/api/lists/:code/tasks/:id', validCode, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || typeof req.body?.done !== 'boolean') {
    return res.status(400).json({ error: 'Потрібен id та поле done (true/false)' });
  }
  const { rows } = await pool.query(
    'UPDATE tasks SET done = $1 WHERE id = $2 AND list_code = $3 RETURNING id, title, done',
    [req.body.done, id, req.params.code]
  );
  if (!rows.length) return res.status(404).json({ error: 'Завдання не знайдено' });
  res.json(rows[0]);
}));

// Видалити завдання
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

// Сторінка списку: той самий index.html, код береться з адреси
app.get('/l/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обробник помилок
app.use((err, req, res, next) => {
  console.error('Помилка:', err.message);
  res.status(500).json({ error: 'Помилка сервера' });
});

// Створюємо таблицю при старті (щоб у хмарі все працювало з першого запуску)
await pool.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL PRIMARY KEY,
    list_code   TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    done        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks (list_code);
`);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Сервер працює: http://localhost:${port} (версія ${VERSION})`));