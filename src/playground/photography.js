import { createLookLink } from '../shared-look.js';
import { makePostcard, restorePostcard, POSTCARD_WIDTH, POSTCARD_HEIGHT } from './postcard.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function smallPrint(canvas) {
  const thumbnail = document.createElement('canvas'); thumbnail.width = POSTCARD_WIDTH / 2; thumbnail.height = POSTCARD_HEIGHT / 2;
  thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height); return thumbnail;
}

export function createPhotography({ view, tr, language, keepsakes, snapshot, pause, onWear }) {
  const panel = document.createElement('section'); panel.className = 'playground-journal'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', tr('travelAlbum')); view.append(panel);
  const abort = new AbortController(), urls = new Set(); let contentAbort = new AbortController(), shareAbort = new AbortController(), currentCanvas, previousFocus, disposed = false;
  function close() {
    if (panel.hidden) return;
    panel.hidden = true; view.querySelectorAll(':scope > [data-journal-inert]').forEach(node => { node.inert = false; node.removeAttribute('data-journal-inert'); });
    contentAbort.abort(); shareAbort.abort(); currentCanvas = null;
    urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); previousFocus?.focus({ preventScroll: true });
  }
  function show(title) {
    contentAbort.abort(); shareAbort.abort(); contentAbort = new AbortController();
    if (panel.hidden) previousFocus = document.activeElement;
    pause(); panel.hidden = false;
    for (const node of view.children) if (node !== panel) { node.inert = true; node.dataset.journalInert = ''; }
    panel.innerHTML = `<div class="journal-sheet"><header><div><span>DUCKROBE / LITTLE TRAVELS</span><h2>${escape(title)}</h2></div><button data-journal-close aria-label="${escape(tr('travelClose'))}">×</button></header><div data-journal-content></div><p class="journal-note">${escape(tr('travelNote'))}</p><p data-journal-status role="status"></p></div>`;
    panel.querySelector('[data-journal-close]').focus();
  }
  function download(canvas, filename) {
    canvas.toBlob(blob => {
      if (!blob || disposed || panel.hidden) return;
      const url = URL.createObjectURL(blob); urls.add(url);
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    }, 'image/png');
  }
  function share(photo, getCanvas) {
    shareAbort.abort(); shareAbort = new AbortController();
    const content = panel.querySelector('[data-journal-content]'), signal = shareAbort.signal;
    content.querySelector('.journal-sharing')?.remove();
    const section = document.createElement('div'); section.className = 'journal-sharing';
    const url = createLookLink(photo);
    section.innerHTML = `<p>${escape(tr('travelShareNote'))}</p><label><span>${escape(tr('travelLookLink'))}</span><input readonly value="${escape(url)}" /></label><div><button data-share-copy>${escape(tr('travelCopy'))}</button>${typeof navigator.share === 'function' ? `<button data-share-native>${escape(tr('travelSend'))}</button>` : ''}</div><p data-share-status role="status"></p>`;
    content.append(section); section.scrollIntoView({ block: 'nearest' });
    const input = section.querySelector('input'); section.querySelector('[data-share-copy]').focus();
    section.querySelector('[data-share-copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); if (!signal.aborted) section.querySelector('[data-share-status]').textContent = tr('travelCopied'); }
      catch { if (!signal.aborted) { input.focus(); input.select(); section.querySelector('[data-share-status]').textContent = tr('travelCopyManual'); } }
    }, { signal });
    section.querySelector('[data-share-native]')?.addEventListener('click', async () => {
      try {
        const canvas = await getCanvas(); if (signal.aborted) return;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob || signal.aborted) return;
        const files = [new File([blob], `duckrobe-${photo.worldId}.png`, { type: 'image/png' })];
        await navigator.share({ title: 'DuckRobe', text: tr('travelShareNote'), url, ...(navigator.canShare?.({ files }) ? { files } : {}) });
      } catch (error) { if (error.name !== 'AbortError' && !signal.aborted) section.querySelector('[data-share-status]').textContent = tr('travelCopyManual'); }
    }, { signal });
  }
  function album() {
    currentCanvas = null; show(tr('travelAlbum'));
    const photos = keepsakes.photos(), content = panel.querySelector('[data-journal-content]');
    if (!photos.length) { content.innerHTML = `<p class="journal-empty">${escape(tr('travelEmpty'))}</p>`; return; }
    const grid = document.createElement('div'); grid.className = 'journal-grid'; content.append(grid);
    for (const photo of photos) {
      const card = document.createElement('article'); card.dataset.memory = photo.id;
      card.innerHTML = `<img alt="${escape(photo.place)}" src="${photo.image}"/><p>${escape(photo.place)} · ${escape(photo.date.slice(0, 10))}</p><div><button data-memory-wear>${escape(tr('travelWear'))}</button><button data-memory-download>${escape(tr('travelDownload'))}</button><button data-memory-share>${escape(tr('travelShare'))}</button><button data-memory-delete>${escape(tr('travelDelete'))}</button></div>`;
      grid.append(card);
      card.querySelector('[data-memory-wear]').addEventListener('click', () => { close(); onWear?.(photo); }, { signal: contentAbort.signal });
      card.querySelector('[data-memory-delete]').addEventListener('click', () => { const saved = keepsakes.removePhoto(photo.id); album(); if (!saved) panel.querySelector('[data-journal-status]').textContent = tr('travelStorage'); }, { signal: contentAbort.signal });
      card.querySelector('[data-memory-share]').addEventListener('click', () => share(photo, () => restorePostcard(photo, language)), { signal: contentAbort.signal });
      const signal = contentAbort.signal;
      // Retypeset the stored photograph so older album pages share the
      // current stamp design. Leave the original photo/storage untouched.
      restorePostcard(photo, language).then(canvas => {
        if (!signal.aborted) card.querySelector('img').src = smallPrint(canvas).toDataURL('image/jpeg', .77);
      }).catch(() => { /* The stored thumbnail remains a usable fallback. */ });
      card.querySelector('[data-memory-download]').addEventListener('click', async () => {
        try { const canvas = await restorePostcard(photo, language); if (!signal.aborted) download(canvas, `duckrobe-${photo.worldId}-${photo.date.slice(0, 10)}.png`); }
        catch { if (!signal.aborted) panel.querySelector('[data-journal-status]').textContent = tr('travelImageError'); }
      }, { signal });
    }
  }
  function take() {
    const data = snapshot(); if (!data) return;
    pause(); currentCanvas = makePostcard(data.renderer, data.scene, data.camera, data, language);
    const thumbnail = smallPrint(currentCanvas);
    let image;
    for (const quality of [.77, .60, .45]) { image = thumbnail.toDataURL('image/jpeg', quality); if (image.length < 220000) break; }
    const photo = { id: crypto.randomUUID(), worldId: data.worldId, place: data.place, date: data.isoDate,
      selection: data.selection, colors: data.colors, image, language, look: data.look, badge: data.badge, postcardVersion: 2 };
    const saved = keepsakes.addPhoto(photo); show(tr('travelPhoto'));
    const content = panel.querySelector('[data-journal-content]');
    content.innerHTML = `<img class="journal-photo" alt="${escape(data.place)}" src="${currentCanvas.toDataURL('image/jpeg', .88)}"/><div class="journal-actions"><button data-photo-download>${escape(tr('travelDownload'))}</button><button data-photo-share>${escape(tr('travelShare'))}</button><button data-photo-album>${escape(tr('travelAlbum'))}</button></div>`;
    if (data.personalCamera) content.querySelector('img').dataset.instant = '';
    panel.querySelector('[data-journal-status]').textContent = tr(saved ? 'travelSaved' : 'travelStorage');
    panel.querySelector('[data-photo-download]').addEventListener('click', () => download(currentCanvas, `duckrobe-${data.worldId}-${data.isoDate.slice(0, 10)}.png`), { signal: contentAbort.signal });
    panel.querySelector('[data-photo-share]').addEventListener('click', () => share(photo, () => currentCanvas), { signal: contentAbort.signal });
    panel.querySelector('[data-photo-album]').addEventListener('click', album, { signal: contentAbort.signal });
  }
  panel.addEventListener('click', event => { if (event.target === panel || event.target.closest('[data-journal-close]')) close(); }, { signal: abort.signal });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const buttons = [...panel.querySelectorAll('button:not(:disabled), input, a[href]')].filter(node => node.offsetParent !== null), first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, { signal: abort.signal });
  return { take, album, close, get open() { return !panel.hidden; }, dispose() { disposed = true; close(); contentAbort.abort(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); abort.abort(); panel.remove(); } };
}
