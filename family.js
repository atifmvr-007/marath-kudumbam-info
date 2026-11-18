const esc = MK.esc;
const TINTS = ['#FDE2C4', '#D7EBD3', '#D6E4F5', '#FEF3C7', '#FBD5E0', '#E2D3BC'];
const NOTE_COLOURS = ['#FEF3C7', '#FBD5E0', '#D7EBD3', '#D6E4F5', '#FDE2C4'];
const EVENT_COLOURS = ['#FDE2C4', '#D7EBD3', '#D6E4F5', '#FEF3C7', '#FBD5E0'];
const $ = (id) => document.getElementById(id);
const people = [];
let PHOTOS = [];
let ALBUMS = [];
let lbIndex = 0;
let hdUrl = null;
const sharePicker = MK.createPicker($('sharePicker'));

if (!MK.familyToken()) location.replace('/');

function logout() { MK.clearFamily(); location.href = '/'; }
const initials = (name) => name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
const face = (person) => person.photo_url ? `<img src="${esc(person.photo_url)}" alt="">` : esc(initials(person.name));

$('hello').innerHTML = [...$('hello').textContent].map((c, i) => c === ' ' ? ' ' : `<span class="ch" style="animation-delay:${.1 + i * .04}s">${esc(c)}</span>`).join('');

function personHTML(person) {
  const i = people.push(person) - 1;
  return `<button class="person" type="button" data-person="${i}"><div class="face" style="background:${TINTS[i % TINTS.length]}">${face(person)}</div><b>${esc(person.name)}</b><small>${esc(person.relation)}</small></button>`;
}
function unitHTML(unit, depth) {
  const delay = `${(depth * .45).toFixed(2)}s`;
  const tilt = ((people.length % 3) - 1) * 1.5;
  let html = `<li style="--d:${delay}"><div class="couple" style="--r:${tilt}deg;--d:${delay}">${personHTML(unit.a)}${unit.b ? personHTML(unit.b) : ''}</div>`;
  if (unit.children.length) html += `<ul style="--d:${((depth + .6) * .45).toFixed(2)}s">${unit.children.map((child) => unitHTML(child, depth + 1)).join('')}</ul>`;
  return `${html}</li>`;
}
function renderTree(family) {
  $('treeRoot').innerHTML = family ? `<ul>${unitHTML(family, 0)}</ul>` : '<p class="empty">The family tree will appear here soon.</p>';
  const wrap = document.querySelector('.tree-wrap');
  wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
}
function showPerson(i) {
  const p = people[i];
  $('pmCard').innerHTML = `<button class="pm-x" type="button" aria-label="Close" data-close-person>✕</button>
    <div class="face" style="margin:0 auto;background:${TINTS[i % TINTS.length]}">${face(p)}</div><h3>${esc(p.name)}</h3><p style="font-weight:800;color:var(--rust)">${esc(p.relation)}</p>
    <p style="margin-top:.5rem">${p.born ? `Born ${esc(p.born)}` : ''}${p.place ? `<br>${esc(p.place)}` : ''}</p>`;
  $('pm').classList.add('open');
}

function renderAlbum() {
  const photoCard = (p) => {
    const i = PHOTOS.indexOf(p);
    const sx = (Math.random() - .5) * 600, sy = -300 - Math.random() * 300, sr = (Math.random() - .5) * 90, r = ((i * 37) % 9 - 4) * .9;
    return `<button class="pol" type="button" data-album="${esc(p.album)}" data-i="${i}" style="--sx:${sx}px;--sy:${sy}px;--sr:${sr}deg;--r:${r}deg;--d:${(Math.min(i, 12) * .09).toFixed(2)}s">
      <div class="ph" style="background:${TINTS[i % TINTS.length]}">${p.preview_url ? `<img src="${esc(p.preview_url)}" alt="${esc(p.title)}" loading="lazy">` : 'Photo'}</div><div class="cap">${esc(p.title || 'Family photo')}<small>${esc(p.subtitle)}</small></div></button>`;
  };
  $('filters').innerHTML = ['All', ...ALBUMS.map((a) => a.name)].map((name, i) => `<button type="button" class="${i ? '' : 'on'}" data-album-filter="${esc(name)}">${esc(name)}</button>`).join('');
  $('albumGrid').innerHTML = ALBUMS.map((album) => {
    const photos = PHOTOS.filter((p) => p.album === album.name);
    const date = album.event_date ? new Date(`${album.event_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const details = [date, `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`].filter(Boolean).join(' · ');
    return `<div class="album-section" data-section="${esc(album.name)}"><div class="album-head"><h3>${esc(album.name)}</h3><small>${esc(details)}</small>${album.description ? `<p>${esc(album.description)}</p>` : ''}</div>
      ${photos.length ? `<div class="album">${photos.map(photoCard).join('')}</div>` : '<p class="empty small">No photos in this album yet.</p>'}</div>`;
  }).join('');
}
function setAlbumFilter(button) {
  document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('on', x === button));
  const album = button.dataset.albumFilter, grid = $('albumGrid');
  grid.classList.remove('dealt');
  document.querySelectorAll('.pol').forEach((p) => p.classList.toggle('hide', album !== 'All' && p.dataset.album !== album));
  document.querySelectorAll('.album-section').forEach((section) => { section.hidden = album !== 'All' && section.dataset.section !== album; });
  void grid.offsetWidth;
  setTimeout(() => grid.classList.add('dealt'), 30);
}
async function openLightbox(i) {
  lbIndex = i;
  const photo = PHOTOS[i], holder = $('lbPh');
  holder.style.background = TINTS[i % TINTS.length];
  holder.innerHTML = photo.preview_url ? `<img src="${esc(photo.preview_url)}" alt="${esc(photo.title)}">` : 'Loading photo';
  $('lbCap').textContent = [photo.title, photo.subtitle].filter(Boolean).join(' · ');
  $('lbHd').textContent = 'Download HD';
  $('lb').classList.add('open');
  try {
    const url = URL.createObjectURL(await MK.photoBlob(photo.id, 'screen'));
    if (lbIndex === i && $('lb').classList.contains('open')) holder.innerHTML = `<img src="${url}" alt="${esc(photo.title)}">`;
  } catch { /* the preview stays visible */ }
}
const closeLightbox = () => $('lb').classList.remove('open');
function stepLightbox(direction) {
  const visible = [...document.querySelectorAll('.pol:not(.hide)')].map((p) => Number(p.dataset.i));
  if (visible.length) openLightbox(visible[(visible.indexOf(lbIndex) + direction + visible.length) % visible.length]);
}
async function downloadHd() {
  const photo = PHOTOS[lbIndex], button = $('lbHd');
  button.textContent = 'Getting HD…';
  try {
    if (hdUrl) URL.revokeObjectURL(hdUrl);
    const blob = await MK.photoBlob(photo.id, 'hd');
    hdUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = hdUrl;
    link.download = `${(photo.title || 'family-photo').replace(/[^\w-]+/g, '-')}.${blob.type.split('/')[1] || 'jpg'}`;
    link.click();
    button.textContent = 'Download HD';
  } catch (error) { button.textContent = error.message; }
}

function to24(time) {
  const match = /(\d+):(\d+)\s*(AM|PM)/i.exec(time || '');
  if (!match) return '00:00:00';
  let hour = Number(match[1]) % 12;
  if (/pm/i.test(match[3])) hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}:00`;
}
function renderEvents(events) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = events.map((e) => ({ ...e, d: new Date(`${e.event_date}T00:00:00`) }));
  $('tickets').innerHTML = list.map((e, i) => `<div class="ticket reveal ${e.d < today ? 'past' : ''}" style="transition-delay:${Math.min(i, 6) * .1}s"><div class="stub" style="--c:${EVENT_COLOURS[i % EVENT_COLOURS.length]}"><b>${e.d.getDate()}</b><span>${e.d.toLocaleString('en', { month: 'short' })} ${e.d.getFullYear()}</span></div>
    <div class="tbody"><h4>${esc(e.title)}</h4><p>${esc(e.description)}</p><div class="meta">${esc([e.time_label, e.place].filter(Boolean).join(' · '))}</div></div></div>`).join('');
  const next = list.find((e) => e.d >= today), box = $('next');
  if (!next) { box.innerHTML = '<h3>No upcoming events yet</h3>'; return; }
  const target = new Date(`${next.event_date}T${to24(next.time_label)}`);
  box.innerHTML = `<div class="k">Next family event</div><h3>${esc(next.title)}</h3><div>${next.d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${next.place ? ` · ${esc(next.place)}` : ''}</div>
    <div class="flip">${['Days', 'Hours', 'Minutes', 'Seconds'].map((u) => `<div class="unit"><div class="digit" id="d${u}"><div class="face2">0</div></div><small>${u}</small></div>`).join('')}</div>`;
  const last = {};
  const tick = () => {
    const s = Math.max(0, Math.floor((target - new Date()) / 1000));
    const values = { Days: Math.floor(s / 86400), Hours: Math.floor(s % 86400 / 3600), Minutes: Math.floor(s % 3600 / 60), Seconds: s % 60 };
    for (const key in values) {
      if (last[key] === values[key]) continue;
      last[key] = values[key];
      const el = $(`d${key}`), digit = el.firstElementChild;
      el.classList.remove('flipping'); void el.offsetWidth; el.classList.add('flipping');
      setTimeout(() => { digit.textContent = String(values[key]).padStart(2, '0'); }, 250);
    }
  };
  tick(); setInterval(tick, 1000);
}
function renderNotices(notices) {
  $('cork').innerHTML = notices.length ? notices.map((n, i) => `<div class="note" style="--bg:${NOTE_COLOURS[i % NOTE_COLOURS.length]};--r:${[-3, 2, -1.5, 3][i % 4]}deg"><div class="pin"></div><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><small>${esc(n.date_label)}</small></div>`).join('') : '<p class="empty">No notices yet.</p>';
}

function observeReveals() {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    el.classList.add('in');
    if (el.id === 'tree') el.classList.add('grown');
    if (el.id === 'album') $('albumGrid').classList.add('dealt');
    observer.unobserve(el);
  }), { threshold: .15 });
  document.querySelectorAll('section,.reveal').forEach((el) => observer.observe(el));
}

function openShare(kind) {
  $('shareKind').value = kind;
  $('shareTitle').textContent = kind === 'photo' ? 'Share photos' : 'Share family news';
  $('sharePhotoFields').hidden = kind !== 'photo';
  $('shareNewsFields').hidden = kind === 'photo';
  $('shareAlbum').innerHTML = `${ALBUMS.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('')}<option value="__new">+ Request a new album</option>`;
  syncAlbumRequest();
  $('shareMsg').textContent = '';
  $('share').classList.add('open');
}
function syncAlbumRequest() {
  const requesting = $('shareKind').value === 'photo' && $('shareAlbum').value === '__new';
  $('newAlbumFields').hidden = !requesting;
  $('newAlbumName').required = requesting;
}
async function submitShare(event) {
  event.preventDefault();
  const form = event.target, button = form.querySelector('[type=submit]'), message = $('shareMsg');
  const data = new FormData(form), name = data.get('name').trim();
  button.disabled = true; message.className = 'share-msg';
  let uploadedCount = 0;
  try {
    if (data.get('kind') === 'photo') {
      const files = sharePicker.files();
      if (!files.length) throw new Error('Choose at least one photo.');
      let album = data.get('album');
      if (album === '__new') {
        message.textContent = 'Requesting album…';
        album = (await MK.family('request-album', {
          name, album: data.get('newAlbum'), eventDate: data.get('eventDate'), description: data.get('albumDescription'),
        })).name;
      }
      const result = await MK.uploadMany(files, () => ({ name, title: data.get('title'), album }), null, (text) => { message.textContent = text; });
      if (result.failed.length) {
        sharePicker.set(result.failed.map((item) => item.file));
        throw new Error(`${result.uploaded} sent. ${result.failed.length} could not be sent: ${result.failed[0].message}`);
      }
      uploadedCount = result.uploaded;
    } else {
      message.textContent = 'Sending…';
      await MK.family('submit-notice', { name, title: data.get('newsTitle'), body: data.get('body') });
    }
    form.reset();
    sharePicker.clear();
    syncAlbumRequest();
    const photoWord = uploadedCount === 1 ? 'photo' : 'photos';
    message.textContent = data.get('kind') === 'photo'
      ? (data.get('album') === '__new' ? `Album request and ${uploadedCount} ${photoWord} sent. An admin will review them.` : `${uploadedCount} ${photoWord} sent. An admin will review before they appear.`)
      : 'News sent. An admin will review it before it appears.';
    message.classList.add('ok');
  } catch (error) { message.textContent = error.message; message.classList.add('bad'); }
  button.disabled = false;
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button,[data-share]');
  if (event.target.id === 'pm') $('pm').classList.remove('open');
  if (event.target.id === 'lb') closeLightbox();
  if (event.target.id === 'share') $('share').classList.remove('open');
  if (!target) return;
  if (target.dataset.person) showPerson(Number(target.dataset.person));
  else if ('closePerson' in target.dataset) $('pm').classList.remove('open');
  else if (target.dataset.albumFilter) setAlbumFilter(target);
  else if (target.classList.contains('pol')) openLightbox(Number(target.dataset.i));
  else if (target.dataset.share) openShare(target.dataset.share);
});
addEventListener('keydown', (event) => {
  if (!$('lb').classList.contains('open')) return;
  if (event.key === 'Escape') closeLightbox();
  if (event.key === 'ArrowRight') stepLightbox(1);
  if (event.key === 'ArrowLeft') stepLightbox(-1);
});
document.querySelectorAll('.links a').forEach((a) => a.addEventListener('click', () => document.querySelector('.links').classList.remove('open')));
$('shareForm').addEventListener('submit', submitShare);
$('shareAlbum').addEventListener('change', syncAlbumRequest);
$('lbHd').addEventListener('click', downloadHd);

(async () => {
  try {
    const data = await MK.family('content');
    PHOTOS = data.photos;
    ALBUMS = data.albums;
    renderTree(data.family);
    renderAlbum();
    renderEvents(data.events);
    renderNotices(data.notices);
    document.querySelectorAll('.pol').length || $('albumGrid').classList.add('dealt');
    observeReveals();
    $('loading').hidden = true;
  } catch (error) {
    if (error.status === 401) { MK.clearFamily(); location.replace('/'); return; }
    $('loading').textContent = error.message;
  }
})();
