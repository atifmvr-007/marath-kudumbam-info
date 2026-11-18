/* Shared browser code. These two Supabase values are public by design. */
window.MK = (() => {
  const URL_BASE = 'https://cppdwandvejbittfmwxe.supabase.co';
  const KEY = 'sb_publishable_kQC3L3pxNqwHMCmHd7Mp6w_iCOb4RjA';
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

  function familyToken() {
    const session = safe(() => sessionStorage.getItem('mf_t'));
    if (session) return session;
    const token = safe(() => localStorage.getItem('mf_t'));
    const expires = Number(safe(() => localStorage.getItem('mf_exp'), 0));
    if (token && expires > Date.now()) return token;
    clearFamily();
    return null;
  }
  function saveFamily(token, expires, remember) {
    safe(() => {
      sessionStorage.setItem('mf_t', token);
      if (remember) {
        localStorage.setItem('mf_t', token);
        localStorage.setItem('mf_exp', String(expires));
      }
    });
  }
  function clearFamily() {
    safe(() => {
      ['mf_t', 'mf_exp', 'mf_pw'].forEach((key) => localStorage.removeItem(key));
      ['mf_t', 'mf_s'].forEach((key) => sessionStorage.removeItem(key));
    });
  }

  async function call(fn, body, jwt, raw) {
    let response;
    try {
      response = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', apikey: KEY,
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw Object.assign(new Error('Could not connect. Check your internet and try again.'), { status: 0 });
    }
    if (raw && response.ok) return response;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: response.status });
    return data;
  }

  const family = (action, data = {}) => call('family-api', { action, token: familyToken(), ...data });
  const media = (action, data = {}, jwt = null) =>
    call('drive-connect', { action, token: jwt ? undefined : familyToken(), ...data }, jwt);

  async function photoBlob(id, size, jwt = null) {
    const response = await call('drive-connect', { action: 'photo-file', id, size, token: jwt ? undefined : familyToken() }, jwt, true);
    return response.blob();
  }

  function resized(bitmap, longest, quality) {
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('This photo could not be prepared.')), 'image/jpeg', quality,
    ));
  }

  async function put(url, blob, type, headers = {}) {
    let response;
    try {
      response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': type, ...headers }, body: blob });
    } catch {
      throw new Error('The upload stopped. Check your internet and try again.');
    }
    if (!response.ok) throw new Error('The upload could not be completed.');
    return response;
  }

  const MAX_HD_BYTES = 30 * 1024 * 1024;
  const ORIGINAL_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const IMAGE_NAME = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;

  /* Keeps the original when possible. Gallery formats are converted to a high-quality JPG. */
  async function preparePhoto(file) {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error(`${file.name}: this phone or browser can't open that photo format. Try a JPG or PNG copy.`); }
    try {
      const preview = await resized(bitmap, 520, 0.74);
      const screen = await resized(bitmap, 1800, 0.84);
      let hd = file;
      if (!ORIGINAL_TYPES.includes(file.type) || file.size > MAX_HD_BYTES) hd = await resized(bitmap, 6000, 0.93);
      if (hd.size > MAX_HD_BYTES) throw new Error(`${file.name}: this photo is too large to save.`);
      return { hd, hdType: hd.type || 'image/jpeg', screen, preview, width: bitmap.width, height: bitmap.height };
    } finally { bitmap.close(); }
  }

  /* Saves an HD photo, a screen copy and a small album preview. */
  async function uploadPhoto(file, details, jwt = null, onStep = () => {}) {
    onStep('Preparing');
    const photo = await preparePhoto(file);
    onStep('Uploading');
    const start = await media('photo-start', { hdType: photo.hdType, hdSize: photo.hd.size, screenSize: photo.screen.size }, jwt);
    await put(start.previewUpload, photo.preview, 'image/jpeg', { apikey: KEY });
    const [hd, copy] = await Promise.all([
      put(start.hdUpload, photo.hd, photo.hdType).then((r) => r.json()),
      put(start.screenUpload, photo.screen, 'image/jpeg').then((r) => r.json()),
    ]);
    onStep('Saving');
    return media('photo-finish', { ...details, ticket: start.ticket, hdId: hd.id, screenId: copy.id, width: photo.width, height: photo.height }, jwt);
  }

  async function uploadMany(files, detailsFor, jwt = null, onProgress = () => {}) {
    let wakeLock = null;
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
    const failed = [];
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      try {
        await api.uploadPhoto(file, detailsFor(file, index), jwt, (step) => onProgress(`${step} photo ${index + 1} of ${files.length}. Keep this page open.`));
        uploaded += 1;
      } catch (error) { failed.push({ file, message: error.message }); }
    }
    try { await wakeLock?.release(); } catch { /* already released */ }
    return { uploaded, failed };
  }

  function createPicker(root, { max = 50 } = {}) {
    const id = `picker-${Math.random().toString(36).slice(2)}`;
    let items = [];
    root.className = 'picker';
    root.innerHTML = `<input class="picker-input" id="${id}" type="file" accept="image/*" multiple><label class="picker-button" for="${id}">Choose photos from gallery or files</label><p class="picker-note" role="status"></p><div class="picker-grid" hidden></div>`;
    const input = root.querySelector('input'), note = root.querySelector('.picker-note'), grid = root.querySelector('.picker-grid');
    const describe = (message = '', isError = false) => {
      note.className = isError ? 'picker-note bad' : 'picker-note';
      note.textContent = message || (items.length ? `${items.length} ${items.length === 1 ? 'photo' : 'photos'} selected. You can add more.` : 'You can select several photos at once.');
    };
    const render = (message, isError) => {
      grid.hidden = !items.length;
      grid.innerHTML = items.map((item, i) => `<div class="picker-item"><img src="${item.url}" alt="" loading="lazy"><button type="button" data-picker-remove="${i}" aria-label="Remove ${esc(item.file.name)}">✕</button></div>`).join('');
      describe(message, isError);
    };
    const release = (list) => list.forEach((item) => URL.revokeObjectURL(item.url));
    const add = (files) => {
      const known = new Set(items.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
      const images = files.filter((file) => file.type.startsWith('image/') || IMAGE_NAME.test(file.name));
      const skipped = files.length - images.length;
      let overLimit = false;
      for (const file of images) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (known.has(key)) continue;
        if (items.length >= max) { overLimit = true; break; }
        known.add(key);
        items.push({ file, url: URL.createObjectURL(file) });
      }
      render(overLimit ? `You can upload ${max} photos at a time.` : skipped ? `${skipped} non-photo ${skipped === 1 ? 'file was' : 'files were'} skipped.` : '', overLimit || skipped > 0);
    };
    input.addEventListener('change', () => { add([...input.files]); input.value = ''; });
    grid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-picker-remove]');
      if (!button) return;
      release(items.splice(Number(button.dataset.pickerRemove), 1));
      render();
    });
    render();
    return {
      files: () => items.map((item) => item.file),
      set(files) { release(items); items = []; add(files); },
      clear() { release(items); items = []; render(); },
    };
  }

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const api = { URL: URL_BASE, KEY, familyToken, saveFamily, clearFamily, family, media, photoBlob, preparePhoto, uploadPhoto, uploadMany, createPicker, esc };
  return api;
})();
