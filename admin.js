const sb = supabase.createClient(MK.URL, MK.KEY);
const esc = MK.esc;
const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const TABS = [['approvals', 'Approvals'], ['tree', 'Family tree'], ['album', 'Photo album'], ['events', 'Events'], ['notices', 'Notices'], ['home', 'Home page']];
const OWNER_TABS = [['admins', 'Admins'], ['settings', 'Settings']];
const state = { session: null, profile: null, tab: 'approvals', recovery: false, pending: 0 };

const field = (name, label, attrs = '', value = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const authShell = (title, intro, body) => { app.innerHTML = `<main class="auth"><div class="paper"><h1>${title}</h1><p>${intro}</p>${body}</div></main>`; };
const jwt = () => state.session.access_token;
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const when = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

let toastTimer;
function toast(message, isError = false) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.className = isError ? 'toast bad' : 'toast';
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 7000);
}
function bindForm(handler, success) {
  const form = app.querySelector('form') || dialog.querySelector('form');
  form.addEventListener('submit', (event) => runForm(event, handler, success));
}
async function runForm(event, handler, success, { keepValues = false } = {}) {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('[type=submit]'), msg = form.querySelector('.msg');
  button.disabled = true; msg.className = 'msg'; msg.textContent = 'Working…';
  try {
    const result = await handler(Object.fromEntries(new FormData(form)), form, msg);
    if (!keepValues) form.reset();
    msg.textContent = '';
    button.disabled = false;
    if (success) toast(typeof success === 'function' ? success(result) : success);
    return result ?? true;
  } catch (error) {
    msg.classList.add('bad'); msg.textContent = friendly(error.message);
    button.disabled = false;
  }
}
function friendly(message) {
  if (/invalid login/i.test(message)) return 'That email or password is not right.';
  if (/already registered/i.test(message)) return 'That email has already requested access.';
  if (/not authorized/i.test(message)) return 'Email can only be sent to the main admin for now. Ask the main admin for a reset link.';
  if (/rate limit|only request this/i.test(message)) return 'Please wait a little, then try again.';
  if (/albums_name|duplicate key/i.test(message)) return 'An album with that name already exists.';
  return message;
}

function showLogin() {
  authShell('Admin login', 'For Marath Kudumbam admins.', `<form>${field('email', 'Email', 'type="email" autocomplete="email" required')}${field('password', 'Password', 'type="password" autocomplete="current-password" required')}
    <button class="btn main wide" type="submit">Log in</button><div class="msg" role="alert"></div></form>
    <div class="row between"><button class="linkbtn" data-go="forgot">Forgot password?</button><button class="linkbtn" data-go="request">Request admin access</button></div><a href="/">Back to the website</a>`);
  bindForm(async ({ email, password }) => { must(await sb.auth.signInWithPassword({ email, password })); }, 'Logged in.');
}
function showRequest() {
  authShell('Become an admin', 'The main admin reviews every request.', `<form>${field('full_name', 'Your name', 'autocomplete="name" required maxlength="120"')}${field('email', 'Email', 'type="email" autocomplete="email" required')}${field('phone', 'Phone', 'type="tel" autocomplete="tel" required maxlength="30" placeholder="+91 98765 43210"')}${field('password', 'Choose a password', 'type="password" autocomplete="new-password" required minlength="10"')}
    <button class="btn main wide" type="submit">Send request</button><div class="msg" role="alert"></div></form><button class="linkbtn" data-go="login">Back to login</button>`);
  bindForm(async ({ full_name, email, phone, password }) => {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name, phone } } });
    if (error) throw error;
    if (data.user && !data.user.identities?.length) throw new Error('That email has already requested access.');
  }, 'Request sent. The main admin will review it.');
}
function showForgot() {
  authShell('Forgot password', 'Enter your admin email for a reset link.', `<form>${field('email', 'Email', 'type="email" autocomplete="email" required')}<button class="btn main wide" type="submit">Send reset link</button><div class="msg" role="alert"></div></form>
    <p class="muted">Didn't get it? Ask the main admin for a private reset link.</p><button class="linkbtn" data-go="login">Back to login</button>`);
  bindForm(async ({ email }) => { must(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin.html` })); }, 'If that email can receive messages, a reset link is on its way.');
}
function showNewPassword() {
  authShell('Set a new password', 'Use at least 10 characters.', `<form>${field('password', 'New password', 'type="password" autocomplete="new-password" required minlength="10"')}${field('again', 'Type it again', 'type="password" autocomplete="new-password" required minlength="10"')}<button class="btn main wide" type="submit">Save password</button><div class="msg" role="alert"></div></form>`);
  bindForm(async ({ password, again }) => {
    if (password !== again) throw new Error('The two passwords do not match.');
    must(await sb.auth.updateUser({ password }));
    state.recovery = false;
    await route();
  }, 'Password changed.');
}
function showWaiting() {
  const messages = { pending: 'Your request is waiting for the main admin.', rejected: 'Your admin request was not approved.', removed: 'Your admin access was removed.' };
  authShell('Admin access', messages[state.profile?.status] || 'Your account is not ready yet.', '<button class="btn wide" data-act="logout">Log out</button>');
}

async function route() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  if (state.recovery) return showNewPassword();
  if (!session) return showLogin();
  const { data: profile, error } = await sb.from('admin_profiles').select('*').eq('user_id', session.user.id).maybeSingle();
  if (error) { authShell('Admin', 'The admin area could not load. Please try again.', '<button class="btn wide" data-act="logout">Log out</button>'); return; }
  state.profile = profile;
  if (profile?.status !== 'approved') return showWaiting();
  renderShell();
}

const isOwner = () => state.profile?.role === 'owner';
function renderShell() {
  const tabs = isOwner() ? [...TABS, ...OWNER_TABS] : TABS;
  app.innerHTML = `<header class="top"><h1>Marath Kudumbam admin</h1><div class="row"><a href="/">View site</a><button class="btn" data-act="logout">Log out</button></div></header>
    <div class="layout"><nav class="tabs" aria-label="Admin sections">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'on' : ''}"><span>${label}</span>${id === 'approvals' ? '<span class="badge" id="pendingBadge" hidden></span>' : ''}</button>`).join('')}</nav><main id="view">${SKELETON}</main></div>`;
  loadTab();
}
const SKELETON = '<div aria-hidden="true"><span class="sk" style="width:220px;height:42px;margin-bottom:18px"></span><span class="sk" style="height:76px;margin-bottom:12px"></span><span class="sk" style="height:76px;margin-bottom:12px"></span><span class="sk" style="height:76px"></span></div><p class="muted">Loading…</p>';
async function loadTab() {
  const view = document.getElementById('view');
  view.innerHTML = SKELETON;
  try { view.innerHTML = await VIEWS[state.tab](); afterView(); }
  catch (error) { view.innerHTML = `<p class="msg bad">${esc(friendly(error.message))}</p>`; }
  refreshBadge();
}
let afterView = () => {};
async function refreshBadge() {
  const [photos, notices, admins, albums] = await Promise.all([
    sb.from('photos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('notices').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    isOwner() ? sb.from('admin_profiles').select('user_id', { count: 'exact', head: true }).eq('status', 'pending') : { count: 0 },
    sb.from('albums').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const badge = document.getElementById('pendingBadge');
  const total = (photos.count || 0) + (notices.count || 0) + (admins.count || 0) + (albums.count || 0);
  if (badge) { badge.textContent = total; badge.hidden = !total; }
}

function openForm(title, fields, values, save, done = 'Saved.') {
  dialog.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${fields.map((f) => {
    const value = values?.[f.name] ?? f.value ?? '';
    const required = f.required ? 'required' : '';
    if (f.type === 'textarea') return `<label class="field"><span>${f.label}</span><textarea name="${f.name}" maxlength="${f.max || 4000}" ${required}>${esc(value)}</textarea></label>`;
    if (f.type === 'select') return `<label class="field"><span>${f.label}</span><select name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    return field(f.name, f.label, `type="${f.type || 'text'}" ${f.max ? `maxlength="${f.max}"` : ''} ${f.attrs || ''} ${required}`, value);
  }).join('')}<div class="msg" role="alert"></div><div class="row between"><button class="btn" type="button" data-close>Cancel</button><button class="btn main" type="submit">Save</button></div></form>`;
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    const ok = await runForm(event, async (data, form, msg) => { await save(data, form, msg); return true; }, done);
    if (ok) { dialog.close(); loadTab(); }
  });
  dialog.showModal();
}
const confirmDo = (message) => confirm(message);

const signedUrls = async (rows) => {
  const paths = rows.map((r) => r.preview_path).filter(Boolean);
  if (!paths.length) return {};
  const data = must(await sb.storage.from('previews').createSignedUrls(paths, 3600));
  return Object.fromEntries(data.map((d) => [d.path, d.signedUrl]));
};

const PERSON_FIELDS = (photos) => [
  { name: 'name', label: 'Name', required: true, max: 120 }, { name: 'relation', label: 'Relationship', max: 80 },
  { name: 'born', label: 'Birth year', max: 40 }, { name: 'place', label: 'Place', max: 120 },
  { name: 'photo_id', label: 'Profile photo', type: 'select', options: [['', 'No photo'], ...photos.map((p) => [p.id, p.title || 'Untitled photo'])] },
];
const personValues = (data) => ({ name: data.name.trim(), relation: data.relation.trim(), born: data.born.trim(), place: data.place.trim(), photo_id: data.photo_id || null });
let treeData = { people: new Map(), units: [], photos: [] };

const VIEWS = {
  async approvals() {
    const [photos, notices, admins, albums] = await Promise.all([
      sb.from('photos').select('*').eq('status', 'pending').order('created_at'),
      sb.from('notices').select('*').eq('status', 'pending').order('created_at'),
      isOwner() ? sb.from('admin_profiles').select('*').eq('status', 'pending').order('created_at') : { data: [] },
      sb.from('albums').select('*').eq('status', 'pending').order('created_at'),
    ]);
    const photoRows = must(photos), urls = await signedUrls(photoRows), noticeRows = must(notices), adminRows = must(admins), albumRows = must(albums);
    const pendingAlbums = new Set(albumRows.map((a) => a.name));
    const items = [
      ...albumRows.map((a) => { const count = photoRows.filter((p) => p.album === a.name).length; return `<div class="item"><div class="text"><b>New album: ${esc(a.name)}</b>${a.description ? `<p>${esc(a.description)}</p>` : ''}<div class="muted">Requested by ${esc(a.requested_by)}${a.event_date ? ` · ${when(a.event_date)}` : ''} · ${count} ${count === 1 ? 'photo' : 'photos'} waiting</div></div><div class="row"><button class="btn main" data-album-decide="approved" data-id="${a.id}">Approve album</button>${count ? `<button class="btn" data-album-decide="approved" data-with-photos="1" data-id="${a.id}">Approve album and photos</button>` : ''}<button class="btn danger" data-album-decide="rejected" data-id="${a.id}">Reject album</button></div></div>`; }),
      ...adminRows.map((a) => `<div class="item"><div class="text"><b>Admin request: ${esc(a.full_name)}</b><div class="muted">${esc(a.email)} · ${esc(a.phone)}</div></div><div class="row"><button class="btn main" data-admin="approved" data-id="${a.user_id}">Approve</button><button class="btn danger" data-admin="rejected" data-id="${a.user_id}">Reject</button></div></div>`),
      ...photoRows.map((p) => `<div class="item"><img class="mini" src="${esc(urls[p.preview_path] || '')}" alt=""><div class="text"><b>${esc(p.title || 'Untitled photo')}</b><div class="muted">Sent by ${esc(p.submitted_by)} · ${esc(p.album)}${pendingAlbums.has(p.album) ? ' (album waiting for approval)' : ''}</div></div><div class="row">${pendingAlbums.has(p.album) ? '' : `<button class="btn main" data-review-photo="approved" data-id="${p.id}">Approve</button>`}<button class="btn danger" data-delete-photo="${p.id}">Reject</button></div></div>`),
      ...noticeRows.map((n) => `<div class="item"><div class="text"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><div class="muted">Sent by ${esc(n.submitted_by)}</div></div><div class="row"><button class="btn main" data-review-notice="approved" data-id="${n.id}">Approve</button><button class="btn danger" data-review-notice="rejected" data-id="${n.id}">Reject</button></div></div>`),
    ];
    return `<div class="head"><h2>Waiting for approval</h2></div><div class="list">${items.join('') || '<div class="item">Nothing is waiting right now.</div>'}</div>`;
  },
  async tree() {
    const [people, units, photos] = await Promise.all([sb.from('people').select('*'), sb.from('family_units').select('*').order('sort_order'), sb.from('photos').select('id,title').eq('status', 'approved').order('created_at', { ascending: false })]);
    treeData = { people: new Map(must(people).map((p) => [p.id, p])), units: must(units), photos: must(photos) };
    const personLine = (id) => { const p = treeData.people.get(id); return `<button class="linkbtn" data-edit-person="${id}">${esc(p.name)}</button> <span class="muted">${esc(p.relation)}</span>`; };
    const nodeHTML = (unit) => {
      const children = treeData.units.filter((u) => u.parent_unit_id === unit.id);
      return `<div class="tree-node"><div class="item"><div class="text">${personLine(unit.person_a)}${unit.person_b ? `<br>${personLine(unit.person_b)}` : ''}</div><div class="row">${unit.person_b ? '' : `<button class="btn" data-add-partner="${unit.id}">Add partner</button>`}<button class="btn" data-add-child="${unit.id}">Add child</button>${children.length ? '' : `<button class="btn danger" data-delete-unit="${unit.id}">Delete</button>`}</div></div>${children.map(nodeHTML).join('')}</div>`;
    };
    const root = treeData.units.find((u) => !u.parent_unit_id);
    return `<div class="head"><h2>Family tree</h2>${root ? '' : '<button class="btn main" data-add-child="">Add first person</button>'}</div><p class="muted">Select a name to edit it. A person can be deleted after their children are removed.</p><div class="tree-root">${root ? nodeHTML(root) : ''}</div>`;
  },
  async album() {
    const [photos, drive, albums] = await Promise.all([sb.from('photos').select('*').eq('status', 'approved').order('created_at', { ascending: false }), MK.media('drive-status', {}, jwt()), sb.from('albums').select('*').eq('status', 'approved').order('event_date', { ascending: false, nullsFirst: false }).order('name')]);
    const rows = must(photos), urls = await signedUrls(rows);
    state.albums = must(albums);
    afterView = () => {
      afterView = () => {};
      const form = document.getElementById('uploadForm');
      if (!form) return;
      state.picker = MK.createPicker(document.getElementById('adminPicker'));
      if (state.retryFiles?.length) state.picker.set(state.retryFiles);
      state.retryFiles = null;
      form.addEventListener('submit', uploadPhotos);
    };
    const albumOptions = state.albums.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
    const albumRowsHtml = state.albums.map((a) => { const count = rows.filter((p) => p.album === a.name).length; return `<div class="item"><div class="text"><b>${esc(a.name)}</b><div class="muted">${[a.event_date ? when(a.event_date) : '', `${count} ${count === 1 ? 'photo' : 'photos'}`].filter(Boolean).join(' · ')}</div></div><div class="row"><button class="btn" data-album-edit="${a.id}">Edit</button>${a.name === 'Family' ? '' : `<button class="btn danger" data-album-remove="${a.id}">Delete</button>`}</div></div>`; }).join('');
    return `<div class="head"><h2>Photo albums</h2><button class="btn main" data-album-edit="">Create album</button></div><div class="list" style="margin-bottom:18px">${albumRowsHtml}</div>${drive.connected ? `<form class="panel" id="uploadForm"><h3>Add HD photos</h3><div id="adminPicker"></div><label class="field"><span>Album</span><select name="album" required>${albumOptions}</select></label>${field('title', 'Title', 'maxlength="160"')}${field('subtitle', 'Date or caption', 'maxlength="160"')}<div class="msg progress" role="status"></div><button class="btn main" type="submit">Upload</button></form>` : `<div class="panel">Google Drive isn't connected yet. ${isOwner() ? 'Connect it in Settings.' : 'Ask the main admin to connect it.'}</div>`}
      <div class="grid">${rows.map((p) => `<article class="photo"><img src="${esc(urls[p.preview_path] || '')}" alt="${esc(p.title)}" loading="lazy"><b>${esc(p.title || 'Untitled photo')}</b><div class="muted">${esc(p.album)}</div><div class="row" style="margin-top:7px"><button class="btn" data-edit-photo="${p.id}">Edit</button><button class="btn danger" data-delete-photo="${p.id}">Delete</button></div></article>`).join('') || '<p>No photos yet.</p>'}</div>`;
  },
  async events() {
    state.events = must(await sb.from('events').select('*').order('event_date'));
    return `<div class="head"><h2>Events</h2><button class="btn main" data-event="">Add event</button></div><div class="list">${state.events.map((e) => `<div class="item"><div class="text"><b>${esc(e.title)}</b><div class="muted">${when(e.event_date)} ${esc(e.time_label)} · ${esc(e.place)}</div></div><div class="row"><button class="btn" data-event="${e.id}">Edit</button><button class="btn danger" data-delete="events" data-id="${e.id}">Delete</button></div></div>`).join('') || '<div class="item">No events yet.</div>'}</div>`;
  },
  async notices() {
    state.notices = must(await sb.from('notices').select('*').eq('status', 'approved').order('created_at', { ascending: false }));
    return `<div class="head"><h2>Notices</h2><button class="btn main" data-notice="">Add notice</button></div><div class="list">${state.notices.map((n) => `<div class="item"><div class="text"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><div class="muted">${esc(n.date_label)}</div></div><div class="row"><button class="btn" data-notice="${n.id}">Edit</button><button class="btn danger" data-delete="notices" data-id="${n.id}">Delete</button></div></div>`).join('') || '<div class="item">No notices yet.</div>'}</div>`;
  },
  async home() {
    const rows = must(await sb.from('site_text').select('*')), text = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    afterView = () => {
      afterView = () => {};
      document.getElementById('homeForm').addEventListener('submit', (event) => runForm(event, async (data) => {
        must(await sb.from('site_text').upsert(Object.entries(data).map(([key, value]) => ({ key, value: value.trim() }))));
      }, 'Home page saved.', { keepValues: true }));
    };
    return `<div class="head"><h2>Home page</h2></div><form class="panel" id="homeForm"><p class="muted">Anyone can read this page, so don't add private information.</p>${field('kicker', 'Welcome line', 'maxlength="200" required', text.kicker)}<label class="field"><span>Introduction</span><textarea name="lead" maxlength="600" required>${esc(text.lead)}</textarea></label><label class="field"><span>Family quote</span><textarea name="quote" maxlength="400" required>${esc(text.quote)}</textarea></label>${field('generations', 'Generations', 'type="number" min="0" max="99" required', text.generations)}${field('members', 'Family members', 'type="number" min="0" max="9999" required', text.members)}<div class="msg" role="status"></div><button class="btn main" type="submit">Save</button></form>`;
  },
  async admins() {
    const rows = must(await sb.from('admin_profiles').select('*').order('created_at'));
    return `<div class="head"><h2>Admins</h2></div><div class="list">${rows.map((a) => `<div class="item"><div class="text"><b>${esc(a.full_name || a.email)}</b> ${a.role === 'owner' ? '<span class="muted">(main admin)</span>' : ''}<div class="muted">${esc(a.email)} · ${esc(a.phone)} · ${esc(a.status)}</div></div><div class="row">${a.role === 'owner' ? '' : `${a.status === 'approved' ? `<button class="btn" data-reset="${a.user_id}">Reset link</button><button class="btn danger" data-admin="removed" data-id="${a.user_id}">Remove</button>` : `<button class="btn main" data-admin="approved" data-id="${a.user_id}">Approve</button>`}${a.status === 'pending' ? `<button class="btn danger" data-admin="rejected" data-id="${a.user_id}">Reject</button>` : ''}`}</div></div>`).join('')}</div>`;
  },
  async settings() {
    const drive = await MK.media('drive-status', {}, jwt());
    afterView = () => {
      afterView = () => {};
      document.getElementById('passwordForm').addEventListener('submit', (event) => runForm(event, async ({ password, again }, form) => {
        if (password !== again) throw new Error('The two passwords do not match.');
        await MK.media('set-family-password', { password }, jwt());
        form.reset();
      }, 'Family password saved. Everyone must log in with it again.'));
    };
    const result = new URLSearchParams(location.search).get('drive');
    const notes = { connected: 'Google Drive is connected.', failed: 'Google Drive could not connect. Please try again.', cancelled: 'Google Drive connection was cancelled.' };
    return `<div class="head"><h2>Settings</h2></div><section class="panel"><h3>Google Drive</h3><p>${drive.connected ? 'Connected. New HD photos are stored in the family Drive.' : 'Not connected yet.'}</p>${notes[result] ? `<p class="msg ${result === 'connected' ? 'ok' : 'bad'}">${notes[result]}</p>` : ''}<p class="muted">Choose marathkudumbam1@gmail.com when Google asks.</p><button class="btn main" data-drive>${drive.connected ? 'Reconnect Drive' : 'Connect Google Drive'}</button></section>
      <form class="panel" id="passwordForm"><h3>Family password</h3><p class="muted">Changing it logs every family member out.</p>${field('password', 'New family password', 'type="password" autocomplete="new-password" minlength="10" required')}${field('again', 'Type it again', 'type="password" autocomplete="new-password" minlength="10" required')}<div class="msg" role="status"></div><button class="btn main" type="submit">Save family password</button></form>`;
  },
};

async function uploadPhotos(event) {
  await runForm(event, async (data, form, msg) => {
    const files = state.picker.files();
    if (!files.length) throw new Error('Choose at least one photo.');
    const { uploaded, failed } = await MK.uploadMany(files, () => ({ title: data.title, subtitle: data.subtitle, album: data.album }), jwt(), (text) => { msg.textContent = text; });
    if (failed.length && !uploaded) throw new Error(failed[0].message);
    state.retryFiles = failed.map((item) => item.file);
    await loadTab();
    if (failed.length) toast(`${uploaded} uploaded. ${failed.length} failed and stayed selected: ${failed[0].message}`, true);
    else toast(uploaded === 1 ? 'Photo uploaded.' : `${uploaded} photos uploaded.`);
  });
}

const personForm = (title, values, save) => openForm(title, PERSON_FIELDS(treeData.photos), values, save, 'Family tree updated.');
const addPerson = async (data) => must(await sb.from('people').insert(personValues(data)).select('id').single()).id;
const ACTIONS = {
  async logout() { await sb.auth.signOut(); },
  tab(target) { state.tab = target.dataset.tab; renderShell(); },
  go(target) { ({ login: showLogin, request: showRequest, forgot: showForgot })[target.dataset.go](); },
  close() { dialog.close(); },
  editPerson(target) { const p = treeData.people.get(target.dataset.editPerson); personForm('Edit person', p, async (d) => must(await sb.from('people').update(personValues(d)).eq('id', p.id))); },
  addPartner(target) { personForm('Add partner', {}, async (d) => { const id = await addPerson(d); must(await sb.from('family_units').update({ person_b: id }).eq('id', target.dataset.addPartner)); }); },
  addChild(target) {
    const parent = target.dataset.addChild || null;
    personForm(parent ? 'Add child' : 'Add first person', {}, async (d) => {
      const id = await addPerson(d), sort = treeData.units.filter((u) => u.parent_unit_id === parent).length;
      must(await sb.from('family_units').insert({ parent_unit_id: parent, person_a: id, sort_order: sort }));
    });
  },
  async deleteUnit(target) {
    const unit = treeData.units.find((u) => u.id === target.dataset.deleteUnit);
    if (!confirmDo('Delete this family entry?')) return;
    must(await sb.from('family_units').delete().eq('id', unit.id));
    must(await sb.from('people').delete().in('id', [unit.person_a, unit.person_b].filter(Boolean)));
    loadTab();
    toast('Removed from the family tree.');
  },
  async editPhoto(target) {
    const p = must(await sb.from('photos').select('id,title,subtitle,album').eq('id', target.dataset.editPhoto).single());
    openForm('Edit photo', [{ name: 'title', label: 'Title', max: 160 }, { name: 'subtitle', label: 'Date or caption', max: 160 }, { name: 'album', label: 'Album', type: 'select', options: state.albums.map((a) => [a.name, a.name]) }], p, async (d) => must(await sb.from('photos').update(d).eq('id', p.id)), 'Photo details saved.');
  },
  albumEdit(target) {
    const row = state.albums.find((a) => a.id === target.dataset.albumEdit);
    const nameField = row?.name === 'Family' ? [] : [{ name: 'name', label: 'Album name', required: true, max: 60, attrs: 'placeholder="Wedding of ..."' }];
    openForm(row ? 'Edit album' : 'Create album', [...nameField, { name: 'event_date', label: 'Event date', type: 'date' }, { name: 'description', label: 'About this event', type: 'textarea', max: 300 }], row, async (d) => {
      const values = { ...d, event_date: d.event_date || null, description: d.description.trim(), ...(d.name ? { name: d.name.trim().replace(/\s+/g, ' ') } : {}) };
      must(row ? await sb.from('albums').update(values).eq('id', row.id) : await sb.from('albums').insert({ ...values, status: 'approved', reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString() }));
    }, row ? 'Album updated.' : 'Album created.');
  },
  async albumRemove(target) {
    if (!confirmDo('Delete this album? Its photos will move to the Family album.')) return;
    must(await sb.rpc('remove_album', { p_album_id: target.dataset.albumRemove }));
    loadTab();
    toast('Album deleted. Its photos moved to Family.');
  },
  async albumDecide(target) {
    const decision = target.dataset.albumDecide, includePhotos = !!target.dataset.withPhotos;
    if (decision === 'rejected' && !confirmDo('Reject this album? Its waiting photos will move to the Family album for review.')) return;
    must(await sb.rpc('decide_album', { p_album_id: target.dataset.id, p_decision: decision, p_include_photos: includePhotos }));
    loadTab();
    toast(decision === 'rejected' ? 'Album rejected. Its photos moved to Family for review.' : includePhotos ? 'Album and photos approved.' : 'Album approved.');
  },
  async deletePhoto(target) { if (confirmDo('Delete this photo permanently, including the HD copy?')) { await MK.media('photo-delete', { id: target.dataset.deletePhoto }, jwt()); loadTab(); toast(state.tab === 'approvals' ? 'Photo rejected and deleted.' : 'Photo deleted.'); } },
  async reviewPhoto(target) { must(await sb.from('photos').update({ status: 'approved', reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString() }).eq('id', target.dataset.id)); loadTab(); toast('Photo approved.'); },
  async reviewNotice(target) { const decision = target.dataset.reviewNotice; must(await sb.from('notices').update({ status: decision, reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString() }).eq('id', target.dataset.id)); loadTab(); toast(decision === 'approved' ? 'Notice approved.' : 'Notice rejected.'); },
  event(target) {
    const row = state.events.find((e) => e.id === target.dataset.event);
    openForm(row ? 'Edit event' : 'Add event', [{ name: 'title', label: 'Title', required: true, max: 160 }, { name: 'event_date', label: 'Date', type: 'date', required: true }, { name: 'time_label', label: 'Time', max: 40, attrs: 'placeholder="10:00 AM"' }, { name: 'place', label: 'Place', max: 160 }, { name: 'description', label: 'Details', type: 'textarea', max: 2000 }], row, async (d) => must(row ? await sb.from('events').update(d).eq('id', row.id) : await sb.from('events').insert(d)), row ? 'Event updated.' : 'Event added.');
  },
  notice(target) {
    const row = state.notices.find((n) => n.id === target.dataset.notice);
    openForm(row ? 'Edit notice' : 'Add notice', [{ name: 'title', label: 'Title', required: true, max: 160 }, { name: 'body', label: 'Message', type: 'textarea', required: true, max: 4000 }, { name: 'date_label', label: 'Date shown', max: 40 }], row, async (d) => must(row ? await sb.from('notices').update(d).eq('id', row.id) : await sb.from('notices').insert({ ...d, status: 'approved', reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString() })), row ? 'Notice updated.' : 'Notice added.');
  },
  async delete(target) { if (confirmDo('Delete this permanently?')) { must(await sb.from(target.dataset.delete).delete().eq('id', target.dataset.id)); loadTab(); toast('Deleted.'); } },
  async admin(target) {
    const decision = target.dataset.admin;
    if (decision !== 'approved' && !confirmDo(decision === 'removed' ? 'Remove this admin?' : 'Reject this request?')) return;
    must(await sb.rpc('decide_admin', { p_user_id: target.dataset.id, p_decision: decision }));
    loadTab();
    toast({ approved: 'Admin approved.', rejected: 'Request rejected.', removed: 'Admin removed.' }[decision]);
  },
  async reset(target) {
    const { link } = await MK.media('reset-link', { userId: target.dataset.reset }, jwt());
    dialog.innerHTML = `<h2>Private reset link</h2><p>Send this only to that admin. Anyone with the link can change their password.</p><div class="copybox">${esc(link)}</div><div class="row between"><button class="btn" data-close>Close</button><button class="btn main" data-copy="${esc(link)}">Copy link</button></div>`;
    dialog.showModal();
  },
  async copy(target) { await navigator.clipboard.writeText(target.dataset.copy); target.textContent = 'Copied'; },
  async drive() { const { url } = await MK.media('drive-auth-url', {}, jwt()); location.href = url; },
};
const ACTION_KEYS = { act: null, albumEdit: 'albumEdit', albumRemove: 'albumRemove', albumDecide: 'albumDecide', tab: 'tab', go: 'go', close: 'close', editPerson: 'editPerson', addPartner: 'addPartner', addChild: 'addChild', deleteUnit: 'deleteUnit', editPhoto: 'editPhoto', deletePhoto: 'deletePhoto', reviewPhoto: 'reviewPhoto', reviewNotice: 'reviewNotice', event: 'event', notice: 'notice', delete: 'delete', admin: 'admin', reset: 'reset', copy: 'copy', drive: 'drive' };
document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  const key = Object.keys(ACTION_KEYS).find((name) => name in target.dataset);
  if (!key) return;
  const action = key === 'act' ? target.dataset.act : ACTION_KEYS[key];
  target.disabled = true;
  try { await ACTIONS[action](target); }
  catch (error) { alert(friendly(error.message)); }
  target.disabled = false;
});

sb.auth.onAuthStateChange((eventName) => {
  if (eventName === 'PASSWORD_RECOVERY') state.recovery = true;
  if (['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY'].includes(eventName)) {
    const sameUser = eventName === 'SIGNED_IN' && state.profile && state.session;
    if (!sameUser) setTimeout(route, 0);
  }
});
if (new URLSearchParams(location.search).has('drive')) state.tab = 'settings';
route();
