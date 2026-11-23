const $ = (sel) => document.querySelector(sel);

const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const match = location.pathname.match(/^\/l\/([A-Za-z0-9_-]{16,64})$/);
const code = match ? match[1] : null;

const now = new Date();
const state = {
  tasks: [],
  filter: 'all',
  selected: null,                                   // вибраний день (YYYY-MM-DD)
  month: new Date(now.getFullYear(), now.getMonth(), 1),
  editing: null,                                    // id завдання в режимі редагування
};

// ---------- Дати (локальний час, без UTC-зсувів) ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parts = (s) => s.split('-').map(Number);
const addDays = (s, n) => { const [y, m, d] = parts(s); return ymd(new Date(y, m - 1, d + n)); };
const fmtDate = (s) => {
  const [y, m, d] = parts(s);
  return new Intl.DateTimeFormat('uk', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
};

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

// ---------- Вигляд: фон і акцент ----------
function initLook() {
  const custom = $('#bgCustom');
  const current = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (/^#[0-9a-f]{6}$/i.test(current)) custom.value = current;

  document.querySelectorAll('#bgs .swatch').forEach((s) => {
    s.style.background = s.dataset.bg;
    s.addEventListener('click', () => {
      applyBg(s.dataset.bg, true);
      custom.value = s.dataset.bg;
    });
  });
  custom.addEventListener('input', () => applyBg(custom.value, true));

  document.querySelectorAll('#accents .swatch').forEach((s) =>
    s.addEventListener('click', () => applyAccent(s.dataset.accent, true))
  );
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

// ---------- Календар ----------
function renderCalendar() {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  const title = new Intl.DateTimeFormat('uk', { month: 'long', year: 'numeric' }).format(state.month);
  $('#month').textContent = title.charAt(0).toUpperCase() + title.slice(1);

  const offset = (new Date(y, m, 1).getDay() + 6) % 7;   // тиждень з понеділка
  const total = new Date(y, m + 1, 0).getDate();
  const today = ymd(new Date());

  const byDate = {};
  for (const t of state.tasks) {
    if (!t.due_date) continue;
    const info = (byDate[t.due_date] ||= { open: 0, total: 0 });
    info.total++;
    if (!t.done) info.open++;
  }

  const box = $('#days');
  box.replaceChildren();
  for (let i = 0; i < offset; i++) box.append(el('span'));

  for (let d = 1; d <= total; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const b = el('button', { type: 'button', className: 'day', textContent: d });
    if (key === today) b.classList.add('today');
    if (key === state.selected) b.classList.add('selected');
    const info = byDate[key];
    if (info) {
      const cls = info.open ? (key < today ? 'late' : 'open') : 'done';
      b.append(el('i', { className: 'dot ' + cls }));
      b.title = `Невиконано: ${info.open} з ${info.total}`;
    }
    b.addEventListener('click', () => selectDay(key));
    box.append(b);
  }
}

function selectDay(key) {
  state.selected = state.selected === key ? null : key;
  $('#due').value = state.selected || '';
  render();
}

// ---------- Список завдань ----------
function visibleTasks() {
  const today = ymd(new Date());
  let list = state.tasks;
  if (state.selected) list = list.filter((t) => t.due_date === state.selected);
  if (state.filter === 'today') list = list.filter((t) => t.due_date === today);
  if (state.filter === 'overdue') list = list.filter((t) => !t.done && t.due_date && t.due_date < today);
  if (state.filter === 'done') list = list.filter((t) => t.done);
  return list;
}

function groupLabel(key, today) {
  if (key === 'none') return 'Без дати';
  if (key === today) return 'Сьогодні';
  if (key === addDays(today, 1)) return 'Завтра';
  return fmtDate(key) + (key < today ? ' · минуло' : '');
}

function taskRow(task) {
  if (state.editing === task.id) return editRow(task);

  const check = el('input', { type: 'checkbox', checked: task.done });
  check.addEventListener('change', () => patch(task.id, { done: check.checked }));

  const title = el('span', { className: 'title', textContent: task.title }); // textContent захищає від XSS
  title.addEventListener('dblclick', () => startEdit(task.id));

  const edit = el('button', { className: 'mini', textContent: '✏️', title: 'Редагувати' });
  edit.setAttribute('aria-label', 'Редагувати');
  edit.addEventListener('click', () => startEdit(task.id));

  const del = el('button', { className: 'mini del', textContent: '🗑', title: 'Видалити' });
  del.setAttribute('aria-label', 'Видалити');
  del.addEventListener('click', () => remove(task.id));

  return el('li', { className: task.done ? 'done' : '' }, check, title, edit, del);
}

function editRow(task) {
  const title = el('input', { value: task.title, maxLength: 200 });
  title.setAttribute('aria-label', 'Назва');
  const due = el('input', { type: 'date', value: task.due_date || '' });
  due.setAttribute('aria-label', 'Дата');

  const save = async () => {
    const t = title.value.trim();
    if (!t) return;
    await patch(task.id, { title: t, due_date: due.value || null });
  };
  const cancel = () => { state.editing = null; render(); };

  const saveBtn = el('button', { className: 'mini', textContent: 'Зберегти', type: 'button' });
  saveBtn.addEventListener('click', save);
  const cancelBtn = el('button', { className: 'mini', textContent: 'Скасувати', type: 'button' });
  cancelBtn.addEventListener('click', cancel);

  for (const input of [title, due]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    });
  }
  setTimeout(() => title.focus(), 0);
  return el('li', { className: 'edit' }, title, due, saveBtn, cancelBtn);
}

function renderTasks() {
  const today = ymd(new Date());
  const list = visibleTasks();
  const box = $('#tasks');
  box.replaceChildren();

  const groups = new Map();   // порядок із сервера: за датою, «без дати» в кінці
  for (const t of list) {
    const key = t.due_date || 'none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  for (const [key, tasks] of groups) {
    const late = key !== 'none' && key < today && tasks.some((t) => !t.done);
    const ul = el('ul');
    ul.append(...tasks.map(taskRow));
    box.append(el('div', { className: 'group' + (late ? ' late' : '') }, el('h3', { textContent: groupLabel(key, today) }), ul));
  }

  const done = state.tasks.filter((t) => t.done).length;
  const overdue = state.tasks.filter((t) => !t.done && t.due_date && t.due_date < today).length;
  $('#stats').textContent = !state.tasks.length
    ? 'Поки що порожньо. Додайте перше завдання.'
    : !list.length
      ? 'За цим фільтром нічого немає.'
      : `Виконано ${done} з ${state.tasks.length}` + (overdue ? ` · прострочено ${overdue}` : '');
}

function render() { renderCalendar(); renderTasks(); }

// ---------- Дії ----------
async function load(force = false) {
  if (state.editing !== null && !force) return;     // не заважаємо редагуванню
  try {
    state.tasks = await api(`/api/lists/${code}/tasks`);
    showError('');
    render();
  } catch (err) { showError(err.message); }
}

async function patch(id, body) {
  state.editing = null;
  try {
    await api(`/api/lists/${code}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  } catch (err) { showError(err.message); }
  await load(true);
}

async function remove(id) {
  if (!confirm('Видалити це завдання?')) return;
  state.editing = null;
  try {
    await api(`/api/lists/${code}/tasks/${id}`, { method: 'DELETE' });
  } catch (err) { showError(err.message); }
  await load(true);
}

function startEdit(id) { state.editing = id; renderTasks(); }

function initList() {
  rememberList();
  $('#list').hidden = false;

  $('#add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#title').value.trim();
    if (!title) return;
    try {
      await api(`/api/lists/${code}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, due_date: $('#due').value || null }),
      });
      $('#title').value = '';
    } catch (err) { showError(err.message); }
    load(true);
  });

  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderTasks();
  });

  $('#prev').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  $('#next').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
  $('#today').addEventListener('click', () => {
    state.month = new Date(now.getFullYear(), now.getMonth(), 1);
    state.selected = ymd(new Date());
    $('#due').value = state.selected;
    render();
  });

  load(true);
  setInterval(() => { if (!document.hidden) load(); }, 5000);   // синхронізація між пристроями
}

// ---------- Старт ----------
initLook();
code ? initList() : initHome();