const $ = (sel) => document.querySelector(sel);

const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const match = location.pathname.match(/^\/l\/([A-Za-z0-9_-]{16,64})$/);
const code = match ? match[1] : null;

const state = {
  tasks: [],
  filter: 'all',
  editId: null,
  seen: new Set(),     // id завдань, які вже були показані (для анімації нових)
};

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Годинник ----------
function tick() {
  const d = new Date();
  $('#time').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('#date').textContent = cap(
    new Intl.DateTimeFormat('uk', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  );
}

// ---------- Допоміжне ----------
function showError(message) {
  const e = $('#error');
  e.textContent = message;
  e.hidden = !message;
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Помилка запиту');
  }
  return res.status === 204 ? null : res.json();
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const fmtCreated = (iso) =>
  new Intl.DateTimeFormat('uk', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso));

// ---------- Налаштування фону ----------
function initLook() {
  const custom = $('#bgCustom');
  const swatches = document.querySelectorAll('#bgs .swatch');
  const mark = (hex) =>
    swatches.forEach((s) => s.classList.toggle('active', s.dataset.bg.toLowerCase() === hex.toLowerCase()));

  const current = document.documentElement.dataset.bg || '#f5f7fb';
  custom.value = current;
  mark(current);

  swatches.forEach((s) =>
    s.addEventListener('click', () => {
      applyBg(s.dataset.bg, true);
      custom.value = s.dataset.bg;
      mark(s.dataset.bg);
    })
  );
  custom.addEventListener('input', () => {
    applyBg(custom.value, true);
    mark(custom.value);
  });
}

// ---------- Головна ----------
function lastList() { try { return localStorage.getItem('lastList'); } catch { return null; } }
function rememberList() { try { localStorage.setItem('lastList', code); } catch {} }

function initHome() {
  $('#home').hidden = false;
  const last = lastList();
  if (last && CODE_RE.test(last)) {
    $('#last').hidden = false;
    $('#last').href = '/l/' + last;
  }
  $('#create').addEventListener('click', async () => {
    try {
      const { code: c } = await api('/api/lists', { method: 'POST' });
      location.href = '/l/' + c;
    } catch (err) { showError(err.message); }
  });
}

// ---------- Список ----------
function visibleTasks() {
  if (state.filter === 'active') return state.tasks.filter((t) => !t.done);
  if (state.filter === 'done') return state.tasks.filter((t) => t.done);
  return state.tasks;
}

function taskItem(t) {
  const check = el('input', { type: 'checkbox', checked: t.done });
  check.setAttribute('aria-label', 'Позначити виконаним');
  check.addEventListener('change', () => patch(t.id, { done: check.checked }));

  const body = el('div', { className: 'body' }, el('div', { className: 'name', textContent: t.title })); // textContent захищає від XSS
  if (t.description) body.append(el('p', { className: 'note', textContent: t.description }));
  body.append(
    el('div', { className: 'meta' },
      el('span', { textContent: 'Створено: ' + fmtCreated(t.created_at) }),
      el('span', { className: 'badge ' + (t.done ? 'done' : 'active'), textContent: t.done ? 'Виконане' : 'Активне' })
    )
  );

  const edit = el('button', { className: 'mini', type: 'button', textContent: '✏️', title: 'Редагувати' });
  edit.setAttribute('aria-label', 'Редагувати');
  edit.addEventListener('click', () => openEditor(t));

  const del = el('button', { className: 'mini del', type: 'button', textContent: '🗑', title: 'Видалити' });
  del.setAttribute('aria-label', 'Видалити');
  del.addEventListener('click', () => remove(t.id));

  const isNew = !state.seen.has(t.id);
  state.seen.add(t.id);

  return el('li', { className: 'task' + (t.done ? ' done' : '') + (isNew ? ' new' : '') },
    check, body, el('div', { className: 'actions' }, edit, del));
}

function render() {
  const list = visibleTasks();
  const ul = $('#tasks');
  ul.replaceChildren(...list.map(taskItem));

  $('#statTotal').textContent = state.tasks.length;
  $('#statDone').textContent = state.tasks.filter((t) => t.done).length;

  const empty = $('#empty');
  empty.hidden = list.length > 0;
  empty.textContent = !state.tasks.length
    ? 'Поки що порожньо. Додайте перше завдання.'
    : 'За цим фільтром нічого немає.';
}

// ---------- Дії ----------
async function load() {
  try {
    state.tasks = await api(`/api/lists/${code}/tasks`);
    showError('');
    render();
  } catch (err) { showError(err.message); }
}

async function patch(id, body) {
  try {
    await api(`/api/lists/${code}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  } catch (err) { showError(err.message); }
  await load();
}

async function remove(id) {
  if (!confirm('Видалити це завдання?')) return;
  try {
    await api(`/api/lists/${code}/tasks/${id}`, { method: 'DELETE' });
  } catch (err) { showError(err.message); }
  await load();
}

// ---------- Редагування (модальне вікно) ----------
function openEditor(task) {
  state.editId = task.id;
  $('#editTitle').value = task.title;
  $('#editDesc').value = task.description || '';
  $('#editor').showModal();
  $('#editTitle').focus();
}

function initEditor() {
  const dlg = $('#editor');

  $('#editCancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // клік повз вікно
  dlg.addEventListener('close', () => { state.editId = null; });

  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#editTitle').value.trim();
    if (!title || state.editId === null) return;
    const id = state.editId;
    dlg.close();
    await patch(id, { title, description: $('#editDesc').value.trim() });
  });
}

function initList() {
  rememberList();
  $('#list').hidden = false;
  initEditor();

  $('#add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#title').value.trim();
    if (!title) return;
    try {
      await api(`/api/lists/${code}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, description: $('#desc').value.trim() }),
      });
      $('#title').value = '';
      $('#desc').value = '';
    } catch (err) { showError(err.message); }
    load();
  });

  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    render();
  });

  load();
  // Синхронізація між пристроями: підтягуємо зміни кожні 5 секунд
  setInterval(() => { if (!document.hidden) load(); }, 5000);
}

// ---------- Старт ----------
initLook();
tick();
setInterval(tick, 1000);
code ? initList() : initHome();