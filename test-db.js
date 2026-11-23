import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
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

  await pool.query(
    'INSERT INTO tasks (list_code, title) VALUES ($1, $2)',
    ['test', 'Перше завдання з хмарної бази']
  );

  const { rows } = await pool.query(
    'SELECT * FROM tasks WHERE list_code = $1',
    ['test']
  );
  console.log('Підключення працює. Рядки:', rows);

  await pool.query('DELETE FROM tasks WHERE list_code = $1', ['test']);
} catch (err) {
  console.error('Помилка:', err.message);
} finally {
  await pool.end();
}