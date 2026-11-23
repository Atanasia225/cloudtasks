const $ = (sel) => document.querySelector(sel);

const match = location.pathname.match(/^\/l\/([A-Za-z0-9_-]{16,64})$/);
const code = match ? match[1] : null;

function showError(message) {
  const el = $('#error');
  el.textContent = message;
  el.hidden = !message;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Помилка запиту');
  }
  return res.status === 204 ? null : res.json();
}

// Версія додатка (під час rolling update видно, яка ревізія відповіла)
async function loadVersion() {
  try {
    const { version } = await api('/api/version');
    $('#version').textContent = 'v ' + version;
  } catch {
    $('#version').textContent = 'офлайн';
  }
}

// Остання відкрита сторінка запам'ятовується лише в цьому браузері
function rememberList() {
  try { localStorage.setItem('lastList', code); } catch {}
}
function lastList() {
  try { return localStorage.getItem('lastList'); } catch { return null; }
}

// ---------- Головна сторінка ----------
function initHome() {
  $('#home').hidden = false;

  const last = lastList();
  if (last && /^[A-Za-z0-9_-]{16,64}$/.test(last)) {
    $('#last').hidden = false;
    $('#last').href = '/l/' + last;
  }

  $('#create').addEventListener('click', async () => {
    try {
      const { code } = await api('/api/lists', { method: 'POST' });
      location.href = '/l/' + code;
    } catch (err) {
      showError(err.message);
    }
  });
}

// ---------- Сторінка списку ----------
function renderTasks(tasks) {
  const ul = $('#tasks');
  ul.replaceChildren();

  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = task.done ? 'done' : '';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = task.done;
    check.addEventListener('change', () => toggle(task.id, check.checked));

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title; // textContent захищає від XSS

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Видалити');
    del.addEventListener('click', () => remove(task.id));

    li.append(check, title, del);
    ul.append(li);
  }

  const done = tasks.filter((t) => t.done).length;
  $('#stats').textContent = tasks.length
    ? `Виконано ${done} з ${tasks.length}`
    : 'Поки що порожньо. Додайте перше завдання.';
}

async function load() {
  try {
    renderTasks(await api(`/api/lists/${code}/tasks`));
    showError('');
  } catch (err) {
    showError(err.message);
  }
}

async function toggle(id, done) {
  try {
    await api(`/api/lists/${code}/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    });
  } catch (err) {
    showError(err.message);
  }
  load();
}

async function remove(id) {
  try {
    await api(`/api/lists/${code}/tasks/${id}`, { method: 'DELETE' });
  } catch (err) {
    showError(err.message);
  }
  load();
}

function initList() {
  rememberList();
  $('#list').hidden = false;
  $('#link').value = location.href;

  $('#copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('#copy').textContent = 'Скопійовано ✓';
    } catch {
      $('#link').select();
    }
    setTimeout(() => ($('#copy').textContent = 'Копіювати'), 1500);
  });

  $('#add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#title');
    const title = input.value.trim();
    if (!title) return;
    try {
      await api(`/api/lists/${code}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      input.value = '';
    } catch (err) {
      showError(err.message);
    }
    load();
  });

  load();
  // Синхронізація: підтягуємо зміни з інших пристроїв кожні 5 секунд
  setInterval(() => { if (!document.hidden) load(); }, 5000);
}

// ---------- Старт ----------
loadVersion();
code ? initList() : initHome();