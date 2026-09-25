// GharKhoji admin panel. Plain JavaScript, no build step.
// Security: every piece of user data is inserted with textContent (never innerHTML),
// so a listing title or chat message can't inject code into this page.
'use strict';

const API = '/api/v1';
const store = {
  get access() { return sessionStorage.getItem('gk_admin_access'); },
  get refresh() { return sessionStorage.getItem('gk_admin_refresh'); },
  set(tokens) {
    sessionStorage.setItem('gk_admin_access', tokens.access_token);
    sessionStorage.setItem('gk_admin_refresh', tokens.refresh_token);
  },
  clear() { sessionStorage.removeItem('gk_admin_access'); sessionStorage.removeItem('gk_admin_refresh'); },
};
let me = null;
let view = sessionStorage.getItem('gk_admin_view') || 'overview';
let counts = { reports: 0 };

// ---------- tiny DOM helper ----------
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $app = () => document.getElementById('app');
const fmtDate = (s) => (s ? new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const rs = (n) => 'Rs ' + Number(n).toLocaleString('en-IN');
const REASONS = {
  fake: 'Fake or misleading', already_rented: 'Already rented', wrong_price: 'Wrong price / hidden costs',
  scam: 'Asks for money before visiting', broker: 'Agent pretending to be owner', offensive: 'Offensive',
  harassment: 'Harassment', fake_listing: 'Fake listing', spam: 'Spam', other: 'Other',
};

function toast(text) {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- API ----------
async function refreshTokens() {
  if (!store.refresh) return false;
  const r = await fetch(API + '/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: store.refresh }),
  });
  if (!r.ok) return false;
  store.set(await r.json());
  return true;
}

async function api(path, { method = 'GET', body, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (store.access) headers.Authorization = 'Bearer ' + store.access;
  const r = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (r.status === 401 && retry && (await refreshTokens())) return api(path, { method, body, retry: false });
  if (r.status === 401) { logout(); throw new Error('Session expired. Please log in again.'); }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const d = data && data.detail;
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d[0].msg : 'Request failed (' + r.status + ')');
  }
  return data;
}

function logout() {
  const rt = store.refresh;
  if (rt) fetch(API + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }) }).catch(() => {});
  store.clear();
  me = null;
  renderLogin();
}

// ---------- login ----------
function renderLogin(message) {
  const err = h('div', { class: 'error', role: 'alert' }, message || '');
  const phone = h('input', { id: 'phone', inputmode: 'numeric', autocomplete: 'username', placeholder: '98XXXXXXXX', required: true });
  const pw = h('input', { id: 'pw', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Log in');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; err.textContent = '';
      try {
        const r = await fetch(API + '/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone.value, password: pw.value }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Login failed');
        if (data.user.role !== 'admin') {
          throw new Error('This account is not an admin. Ask the server owner to run scripts.make_admin.');
        }
        store.set(data);
        me = data.user;
        renderShell();
      } catch (ex) {
        err.textContent = ex.message; pw.value = '';
      } finally { btn.disabled = false; }
    },
  },
  h('h1', {}, 'GharKhoji Admin'),
  h('p', {}, 'Moderators only. Every action is recorded.'),
  h('label', { for: 'phone' }, 'Mobile number'), phone,
  h('label', { for: 'pw' }, 'Password'), pw,
  btn, err);
  $app().replaceChildren(h('div', { class: 'login' }, form));
  phone.focus();
}

// ---------- confirm dialog with note ----------
function ask({ title, text, confirm, danger, needNote }) {
  return new Promise((resolve) => {
    const note = h('textarea', { rows: 3, maxlength: 500, placeholder: needNote ? 'Reason (shown to the owner)' : 'Note (optional)' });
    const dlg = h('dialog', {},
      h('h3', {}, title), h('p', {}, text), note,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { dlg.close(); resolve(null); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : ''), type: 'button',
          onclick: () => { dlg.close(); resolve({ note: note.value.trim() || null }); } }, confirm)));
    dlg.addEventListener('cancel', () => resolve(null));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  });
}

async function act(opts, path, body = {}) {
  const answer = await ask(opts);
  if (!answer) return false;
  try {
    await api(path, { method: 'POST', body: { ...body, note: answer.note } });
    toast(opts.done || 'Done');
    await refreshCounts();
    return true;
  } catch (ex) { toast(ex.message); return false; }
}

// ---------- shell ----------
const VIEWS = [
  ['overview', 'Overview'], ['reports', 'Reports'], ['listings', 'Listings'], ['users', 'Users'], ['audit', 'Activity log'],
];

async function refreshCounts() {
  try {
    const s = await api('/admin/stats');
    counts.reports = s.open_listing_reports + s.open_chat_reports;
    const badge = document.getElementById('badge-reports');
    if (badge) { badge.textContent = counts.reports; badge.hidden = counts.reports === 0; }
    return s;
  } catch { return null; }
}

function renderShell() {
  const nav = h('nav', { class: 'side', 'aria-label': 'Sections' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-dot' }, 'G'), 'GharKhoji'),
    VIEWS.map(([key, label]) => h('button', {
      class: 'nav' + (view === key ? ' active' : ''), type: 'button',
      onclick: () => { view = key; sessionStorage.setItem('gk_admin_view', key); renderShell(); },
    }, label, key === 'reports' ? h('span', { class: 'count', id: 'badge-reports', hidden: counts.reports === 0 }, counts.reports) : null)),
    h('div', { class: 'side-foot' }, h('b', {}, me ? me.full_name || me.phone : ''), 'Admin · ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); logout(); } }, 'Log out')));
  const main = h('main', {});
  $app().replaceChildren(h('div', { class: 'shell' }, nav, main));
  ({ overview: viewOverview, reports: viewReports, listings: viewListings, users: viewUsers, audit: viewAudit })[view](main);
  refreshCounts();
}

function head(title, sub, ...tools) {
  return h('div', { class: 'head' }, h('div', {}, h('h2', {}, title), sub ? h('p', {}, sub) : null),
    tools.length ? h('div', { class: 'toolbar' }, tools) : null);
}
function empty(icon, text) { return h('div', { class: 'empty' }, h('div', { class: 'big' }, icon), text); }
function loading(main) { main.append(h('p', { class: 'meta' }, 'Loading…')); }
function fail(main, ex) { main.append(h('div', { class: 'empty' }, ex.message)); }
function statusPill(s) {
  const color = { active: 'green', removed: 'red', expired: 'yellow', rented: 'teal', draft: '' }[s] ?? '';
  return h('span', { class: 'pill ' + color }, s);
}
function person(label, p) {
  return h('div', { class: 'person' }, h('div', { class: 'k' }, label),
    h('div', {}, h('b', {}, p.name || 'No name'), ' · ', p.phone, ' · ', p.role),
    p.is_active ? null : h('span', { class: 'pill red' }, 'suspended'));
}

// ---------- views ----------
async function viewOverview(main) {
  main.append(head('Overview', 'How GharKhoji is doing right now'));
  const s = await refreshCounts();
  if (!s) return fail(main, new Error('Could not load stats'));
  const items = [
    [s.open_listing_reports + s.open_chat_reports, 'Open reports', true],
    [s.active_listings, 'Live listings'], [s.users, 'Users'], [s.new_users_7d, 'New users (7 days)'],
    [s.messages_24h, 'Chat messages (24 h)'], [s.suspended_users, 'Suspended accounts'],
  ];
  main.append(h('div', { class: 'stats' }, items.map(([n, l, hot]) =>
    h('div', { class: 'stat' + (hot && n > 0 ? ' hot' : '') }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l)))));
  if (s.open_listing_reports + s.open_chat_reports > 0) {
    main.append(h('p', {}, h('button', { class: 'btn warn', type: 'button',
      onclick: () => { view = 'reports'; renderShell(); } }, 'Review reports →')));
  }
}

let reportState = 'open';
async function viewReports(main) {
  const toggle = h('select', { 'aria-label': 'Show', onchange: (e) => { reportState = e.target.value; renderShell(); } },
    h('option', { value: 'open', selected: reportState === 'open' }, 'Needs review'),
    h('option', { value: 'closed', selected: reportState === 'closed' }, 'Handled'));
  main.append(head('Reports', 'Most-reported rooms first', toggle));
  loading(main);
  let items;
  try { items = await api('/admin/reports?state=' + reportState); } catch (ex) { main.lastChild.remove(); return fail(main, ex); }
  main.lastChild.remove();
  if (!items.length) return main.append(empty('🎉', reportState === 'open' ? 'Nothing to review. All clear!' : 'No handled reports yet.'));

  for (const r of items) {
    const isListing = r.kind === 'listing';
    const card = h('div', { class: 'card' },
      h('div', { class: 'card-top' },
        h('div', {},
          h('span', { class: 'pill ' + (isListing ? 'orange' : 'teal') }, isListing ? 'Room report' : 'Chat report'),
          h('span', { class: 'pill red' }, REASONS[r.reason] || r.reason),
          isListing && r.open_reports_on_listing > 1 ? h('span', { class: 'pill yellow' }, r.open_reports_on_listing + ' reports') : null,
          r.resolution ? h('span', { class: 'pill' }, r.resolution.replace('_', ' ')) : null,
          h('h3', { class: 'mt' }, isListing ? r.listing_title : 'Conversation'),
          isListing ? h('div', { class: 'meta' }, 'Listing status: ', r.listing_status) : null),
        h('div', { class: 'meta' }, fmtDate(r.created_at))),
      r.details ? h('div', { class: 'quote' }, r.details) : null,
      h('div', { class: 'people' }, person('Reported by', r.reporter), person(isListing ? 'Posted by' : 'Reported person', r.reported_user)),
      !isListing && r.recent_messages.length ? h('div', { class: 'msgs' }, r.recent_messages.map((m) =>
        h('div', { class: 'msg ' + m.from }, h('div', { class: 'who' }, m.from === 'reported' ? r.reported_user.name || 'Reported' : r.reporter.name || 'Reporter'), m.body))) : null);

    if (r.status === 'open') {
      const base = `/admin/reports/${r.kind}/${r.id}/resolve`;
      const done = () => renderShell();
      card.append(h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          if (await act({ title: 'Dismiss this report?', text: 'Nothing happens to the room or the person.', confirm: 'Dismiss', done: 'Report dismissed' }, base, { action: 'dismiss' })) done();
        } }, 'Dismiss'),
        isListing ? h('button', { class: 'btn warn', type: 'button', onclick: async () => {
          if (await act({ title: 'Remove this room?', text: 'It disappears from search and the owner is notified with your reason.', confirm: 'Remove room', danger: true, needNote: true, done: 'Room removed' }, base, { action: 'remove_listing' })) done();
        } }, 'Remove room') : null,
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await act({ title: 'Suspend ' + (r.reported_user.name || 'this person') + '?', text: 'They are logged out everywhere, can’t log in, and all their rooms are hidden. You can undo this in Users.', confirm: 'Suspend', danger: true, done: 'Account suspended' }, base, { action: 'suspend_user' })) done();
        } }, 'Suspend person'),
        isListing ? h('a', { class: 'btn soft', href: `${API}/listings/${r.listing_id}`, target: '_blank', rel: 'noopener' }, 'Room data') : null));
    }
    main.append(card);
  }
}

let listingQ = '', listingState = '';
async function viewListings(main) {
  const q = h('input', { type: 'search', placeholder: 'Search title or area', value: listingQ });
  const st = h('select', { 'aria-label': 'Status' }, ['', 'active', 'expired', 'rented', 'draft', 'removed'].map((s) =>
    h('option', { value: s, selected: s === listingState }, s || 'All statuses')));
  const go = () => { listingQ = q.value; listingState = st.value; renderShell(); };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && go()); st.addEventListener('change', go);
  main.append(head('Listings', 'Reported rooms first', q, st, h('button', { class: 'btn', type: 'button', onclick: go }, 'Search')));
  loading(main);
  let rows;
  try {
    const qs = new URLSearchParams({ limit: 100, ...(listingQ && { q: listingQ }), ...(listingState && { state: listingState }) });
    rows = await api('/admin/listings?' + qs);
  } catch (ex) { main.lastChild.remove(); return fail(main, ex); }
  main.lastChild.remove();
  if (!rows.length) return main.append(empty('🏠', 'No listings found.'));
  main.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['Room', 'Posted by', 'Monthly', 'Status', 'Reports', ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((l) => h('tr', {},
      h('td', {}, h('b', {}, l.title), h('div', { class: 'meta' }, l.area + ' · ' + fmtDate(l.created_at)),
        l.moderation_reason ? h('div', { class: 'meta' }, 'Removed: ' + l.moderation_reason) : null),
      h('td', {}, l.owner.name || '—', h('div', { class: 'meta' }, l.owner.phone), l.owner.is_active ? null : h('span', { class: 'pill red' }, 'suspended')),
      h('td', {}, rs(l.total_monthly_cost)),
      h('td', {}, statusPill(l.status)),
      h('td', {}, l.open_reports ? h('span', { class: 'pill orange' }, l.open_reports) : '0'),
      h('td', {}, l.status === 'removed'
        ? (l.moderation_reason ? h('button', { class: 'btn soft', type: 'button', onclick: async () => {
            if (await act({ title: 'Restore this room?', text: 'It becomes visible in search again.', confirm: 'Restore', done: 'Room restored' }, `/admin/listings/${l.id}/restore`)) renderShell();
          } }, 'Restore') : h('span', { class: 'meta' }, 'Deleted by owner'))
        : h('button', { class: 'btn danger', type: 'button', onclick: async () => {
            if (await act({ title: 'Remove this room?', text: 'The owner is notified with your reason.', confirm: 'Remove', danger: true, needNote: true, done: 'Room removed' }, `/admin/listings/${l.id}/remove`)) renderShell();
          } }, 'Remove'))))))));
}

let userQ = '', userState = '';
async function viewUsers(main) {
  const q = h('input', { type: 'search', placeholder: 'Search name or phone', value: userQ });
  const st = h('select', { 'aria-label': 'Status' },
    [['', 'Everyone'], ['active', 'Active'], ['suspended', 'Suspended']].map(([v, l]) => h('option', { value: v, selected: v === userState }, l)));
  const go = () => { userQ = q.value; userState = st.value; renderShell(); };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && go()); st.addEventListener('change', go);
  main.append(head('Users', 'Newest first', q, st, h('button', { class: 'btn', type: 'button', onclick: go }, 'Search')));
  loading(main);
  let rows;
  try {
    const qs = new URLSearchParams({ limit: 100, ...(userQ && { q: userQ }), ...(userState && { state: userState }) });
    rows = await api('/admin/users?' + qs);
  } catch (ex) { main.lastChild.remove(); return fail(main, ex); }
  main.lastChild.remove();
  if (!rows.length) return main.append(empty('👤', 'No users found.'));
  main.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['Person', 'Role', 'Joined', 'Rooms', 'Reports against', 'Status', ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((u) => h('tr', {},
      h('td', {}, h('b', {}, u.name || 'No name'), h('div', { class: 'meta' }, u.phone)),
      h('td', {}, h('span', { class: 'pill ' + (u.role === 'admin' ? 'teal' : '') }, u.role)),
      h('td', {}, fmtDate(u.created_at)),
      h('td', {}, u.listings),
      h('td', {}, u.reports_against ? h('span', { class: 'pill orange' }, u.reports_against) : '0'),
      h('td', {}, u.is_active ? h('span', { class: 'pill green' }, 'active') : h('span', { class: 'pill red' }, 'suspended')),
      h('td', {}, u.role === 'admin' || (me && u.id === me.id) ? null : u.is_active
        ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
            if (await act({ title: 'Suspend ' + (u.name || u.phone) + '?', text: 'Logged out everywhere, can’t log in, rooms hidden.', confirm: 'Suspend', danger: true, done: 'Account suspended' }, `/admin/users/${u.id}/suspend`)) renderShell();
          } }, 'Suspend')
        : h('button', { class: 'btn soft', type: 'button', onclick: async () => {
            if (await act({ title: 'Unsuspend ' + (u.name || u.phone) + '?', text: 'They can log in again and their rooms reappear.', confirm: 'Unsuspend', done: 'Account restored' }, `/admin/users/${u.id}/unsuspend`)) renderShell();
          } }, 'Unsuspend'))))))));
}

async function viewAudit(main) {
  main.append(head('Activity log', 'Every moderator action, newest first. Entries can’t be edited or deleted.'));
  loading(main);
  let rows;
  try { rows = await api('/admin/audit?limit=200'); } catch (ex) { main.lastChild.remove(); return fail(main, ex); }
  main.lastChild.remove();
  if (!rows.length) return main.append(empty('📋', 'No actions yet.'));
  main.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['When', 'Moderator', 'Action', 'Target', 'Note'].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((a) => h('tr', {},
      h('td', {}, fmtDate(a.created_at)), h('td', {}, a.admin || '—'),
      h('td', {}, h('span', { class: 'pill ' + (a.action.startsWith('suspend') || a.action.startsWith('remove') ? 'red' : 'teal') }, a.action.replaceAll('_', ' '))),
      h('td', { class: 'meta' }, a.target_type + ' ' + a.target_id.slice(0, 8)),
      h('td', {}, a.note || '—')))))));
}

// ---------- start ----------
(async function start() {
  if (!store.access) return renderLogin();
  try {
    me = await api('/users/me');
    if (me.role !== 'admin') { store.clear(); return renderLogin('This account is not an admin.'); }
    renderShell();
  } catch { renderLogin(); }
})();
