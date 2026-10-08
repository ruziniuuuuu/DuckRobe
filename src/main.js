import './style.css';
import { THEMES, OUTFITS, ITEMS, SLOT_IDS, ACCESSORY_REGIONS, normalizeSelection, selectionKey, selectedItemIds, equipItem, removeItem } from './outfits.js';
import { DEFAULT_ROBOT_COLORS, normalizeRobotColors } from './robot.js';
import { createPreview } from './preview.js';
import { exportLook } from './export.js';
import { t, localized, applyLanguage } from './i18n.js';
import { ACTIONS } from './behavior.js';
import { createLookLink, readSharedLook } from './shared-look.js';

const icons = {
  duck: '<path d="M5 14V8a6 6 0 0 1 12 0v3h5l-5 4v4H5Z"/><circle cx="13" cy="7" r=".8"/><path d="M8 20v2m6-2v2M6 22h4m2 0h4"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>', 'arrow-down': '<path d="M12 5v14m-5-5 5 5 5-5"/>', 'arrow-up': '<path d="M12 19V5m-5 5 5-5 5 5"/>',
  'rotate-ccw': '<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/>', move: '<path d="M12 3v18M3 12h18m-12-6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
  sparkles: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/><path d="M20 2v4m-2-2h4"/>', shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2.3 0 4-2.5 5.5-5M14 8c1.2-1.2 2.4-2 4-2h3m-4-4 4 4-4 4"/>',
  heart: '<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 6l-1.1-1.2a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9Zm-10 11 10 6 10-6M2 19l10 6 10-6" transform="translate(0 -2)"/>', hat: '<path d="M4 15c0 5 16 5 16 0M7 15V8c0-6 10-6 10 0v7M3 15h18"/>', shirt: '<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z"/>',
  glasses: '<circle cx="6" cy="14" r="4"/><circle cx="18" cy="14" r="4"/><path d="M10 14h4M2 14l2-8m18 8-2-8"/>', boots: '<path d="M4 3h6v9l5 3v5H3V9m12-6h5v9l2 3v5h-4"/>', bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', x: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkles}</svg>`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const slotKeys = { all: 'slotAll', hat: 'slotHat', eyewear: 'slotEyewear', body: 'slotBody', accessory: 'slotAccessory', legwear: 'slotLegwear' };
const slotIcons = { all: 'layers', hat: 'hat', eyewear: 'glasses', body: 'shirt', accessory: 'sparkles', legwear: 'boots' };
const regionKeys = { chest: 'regionChest', side: 'regionSide', back: 'regionBack' };
const outfitById = new Map(OUTFITS.map(item => [item.id, item]));
const itemById = new Map(ITEMS.map(item => [item.id, item]));
const themeById = new Map(THEMES.map(item => [item.id, item]));
const receivedLook = readSharedLook(location.hash);
let sharedReceipt = receivedLook;
const STORAGE_KEY = 'duckrobe.wardrobe.v2';
const THUMBNAIL_VERSION = 'microduck-accessories-v5';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; localStorage.removeItem('duckrobe.wardrobe.v1'); } catch { /* Browsing works without storage. */ }
const validSelection = normalizeSelection;
const state = {
  language: stored.language === 'zh' ? 'zh' : 'en', selection: validSelection(stored.selection || OUTFITS[0].selection), colors: normalizeRobotColors(stored.colors || OUTFITS[0].bodyColors), colorLocked: stored.colorLocked === true,
  slot: 'all', accessoryRegion: 'all', theme: 'all', query: '', view: 'wardrobe', favoritesOnly: false,
  favorites: new Set((Array.isArray(stored.favorites) ? stored.favorites : []).filter(key => { const [kind, id] = String(key).split(':'); return kind === 'look' ? outfitById.has(id) : kind === 'item' && itemById.has(id); })),
  saved: (Array.isArray(stored.saved) ? stored.saved : []).filter(look => look && typeof look.id === 'string' && look.selection && typeof look.selection === 'object').slice(0, 60).map(look => ({ id: look.id, selection: validSelection(look.selection), colors: normalizeRobotColors(look.colors), date: typeof look.date === 'string' ? look.date : new Date().toISOString(), thumbnail: look.thumbnailVersion === THUMBNAIL_VERSION && typeof look.thumbnail === 'string' && look.thumbnail.startsWith('data:image/') ? look.thumbnail : null, thumbnailVersion: THUMBNAIL_VERSION })),
  bouncing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
};
let preview, toastUndo, colorGesture, toastTimer, reactionTimer, exporting = false, catalogObserver, catalogEpoch = 0, thumbnailFrame;
const tr = (key, vars) => t(key, state.language, vars);
const nameOf = item => localized(item, state.language);
const colorKey = colors => `${colors.shell}/${colors.accent}`;
const lookColors = look => normalizeRobotColors(look?.bodyColors);
function currentLook(selection = state.selection) { return OUTFITS.find(look => selectionKey(look.selection) === selectionKey(selection)); }
function getLookName(selection = state.selection) { return currentLook(selection) ? nameOf(currentLook(selection)) : selectedItemIds(selection).length ? tr('mixName') : tr('bareName'); }
function toast(message, undo) {
  $('toast-message').textContent = message; $('toast').hidden = false;
  toastUndo = undo; $('toast-undo').hidden = !undo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; toastUndo = null; }, undo ? 10000 : 3500);
}
$('toast-undo').addEventListener('click', () => { const undo = toastUndo; toastUndo = null; $('toast').hidden = true; undo?.(); });
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: state.language, selection: state.selection, colors: state.colors, colorLocked: state.colorLocked, favorites: [...state.favorites], saved: state.saved }));
    $('draft-status').textContent = tr('draftSaved');
    return true;
  } catch { $('draft-status').textContent = tr('draftUnsaved'); toast(tr('storageError')); return false; }
}
// History contains only editable appearance, never saved looks or browsing state.
const lookHistory = [];
const lookSnapshot = () => ({ selection: structuredClone(state.selection), colors: { ...state.colors }, colorLocked: state.colorLocked });
const appearanceKey = look => `${selectionKey(look.selection)}:${colorKey(look.colors)}:${look.colorLocked}`;
function changeLook(update, { group, geometry = true } = {}) {
  const before = lookSnapshot();
  update();
  if (appearanceKey(before) === appearanceKey(state)) return;
  if (!group || group !== colorGesture) {
    lookHistory.push(before);
    if (lookHistory.length > 40) lookHistory.shift();
  }
  colorGesture = group;
  preview?.setColors(state.colors); refreshColors(); refreshLook({ geometry }); if (geometry) renderCatalog(); persist();
}
function undoLook() {
  const previous = lookHistory.pop(); if (!previous) return;
  colorGesture = null; Object.assign(state, previous);
  preview?.setColors(state.colors); refreshColors(); refreshLook({ geometry: true }); renderCatalog(); persist();
  toast(tr('undone'));
}
$('undo-look').addEventListener('click', undoLook);
function refreshSharedReceipt() {
  const note = $('shared-look-note');
  note.hidden = !sharedReceipt || selectionKey(sharedReceipt.selection) !== selectionKey(state.selection) || colorKey(sharedReceipt.colors) !== colorKey(state.colors);
  note.textContent = tr('sharedLookReceived');
}
function wearLook(look) {
  changeLook(() => { state.selection = validSelection(look.selection); state.colors = normalizeRobotColors(look.colors); });
  preview?.setFraming('full');
}
function refreshLook({ geometry = false } = {}) {
  refreshSharedReceipt();
  if (geometry) preview?.setSelection(state.selection);
  $('look-name').textContent = getLookName();
  $('undo-look').disabled = !lookHistory.length;
  $('saved-count').textContent = state.saved.length;
  $('equipped-items').innerHTML = SLOT_IDS.flatMap(slot => {
    const ids = selectedItemIds(state.selection, slot);
    return (ids.length ? ids : [null]).map(id => {
      const item = itemById.get(id), label = item?.region ? tr(regionKeys[item.region]) : tr(slotKeys[slot]);
      return `<div class="equipped-chip${item ? '' : ' empty'}"><button class="equipped-name" data-choose-slot="${slot}"${item?.region ? ` data-region="${item.region}"` : ''} title="${escape(`${label}: ${item ? nameOf(item) : tr('unfilled')}`)}">${icon(slotIcons[slot])}<span><small>${label}</small>${escape(item ? nameOf(item) : tr('unfilled'))}</span></button>${item ? `<button class="equipped-remove" data-remove-slot="${slot}" data-remove-item="${item.id}" aria-label="${escape(tr('remove', { name: nameOf(item) }))}">${icon('x')}</button>` : ''}</div>`;
    });
  }).join('');
  $('equipped-items').querySelectorAll('[data-choose-slot]').forEach(button => button.addEventListener('click', () => { setView('wardrobe'); setSlot(button.dataset.chooseSlot); if (button.dataset.region) { state.accessoryRegion = button.dataset.region; renderAccessoryFilters(); renderCatalog({ resetScroll: true }); } }));
  $('equipped-items').querySelectorAll('[data-remove-item]').forEach(button => button.addEventListener('click', () => { changeLook(() => { state.selection = removeItem(state.selection, button.dataset.removeItem); }); }));
}
function selectLook(id) {
  const look = outfitById.get(id); if (!look) return;
  changeLook(() => { state.selection = validSelection(look.selection); if (!state.colorLocked) state.colors = lookColors(look); });
  preview?.setFraming('full');
}
function selectItem(id) {
  const item = itemById.get(id); if (!item) return;
  changeLook(() => { state.selection = item.slot === 'accessory' && selectedItemIds(state.selection, 'accessory').includes(id) ? removeItem(state.selection, id) : equipItem(state.selection, id); });
  preview?.setFraming(['hat', 'eyewear'].includes(item.slot) ? 'portrait' : 'full');
}
function toggleFavorite(key) { state.favorites.has(key) ? state.favorites.delete(key) : state.favorites.add(key); refreshLook(); renderCatalog(); persist(); }
function renderSlots() {
  $('slot-controls').innerHTML = ['all', ...SLOT_IDS].map(slot => `<button class="slot-button${state.slot === slot ? ' active' : ''}" data-slot="${slot}" aria-pressed="${state.slot === slot}">${icon(slotIcons[slot])}<span>${tr(slotKeys[slot])}</span></button>`).join('');
  $('slot-controls').querySelectorAll('button').forEach(button => button.addEventListener('click', () => setSlot(button.dataset.slot)));
}
function setSlot(slot) {
  preview?.setFraming(['hat', 'eyewear'].includes(slot) ? 'portrait' : 'full');
  state.slot = slot; state.accessoryRegion = 'all';
  renderSlots(); renderFilters(); renderAccessoryFilters(); refreshLook(); renderCatalog({ resetScroll: true });
}
function renderFilters() {
  $('theme-filters').innerHTML = [{ id: 'all', name: tr('allThemes'), en: tr('allThemes') }, ...THEMES].map(theme => `<button class="theme-chip${state.theme === theme.id ? ' active' : ''}" data-theme="${theme.id}" aria-pressed="${state.theme === theme.id}">${escape(nameOf(theme))}</button>`).join('');
  $('theme-filters').querySelectorAll('button').forEach(button => button.addEventListener('click', () => { state.theme = button.dataset.theme; renderFilters(); renderCatalog({ resetScroll: true }); $('collection-filter').open = false; }));
}
function renderAccessoryFilters() {
  const filters = $('accessory-filters'); if (!filters) return;
  filters.hidden = state.slot !== 'accessory' || state.view === 'saved';
  filters.innerHTML = ['all', ...ACCESSORY_REGIONS].map(region => `<button class="theme-chip${state.accessoryRegion === region ? ' active' : ''}" data-accessory-region="${region}" aria-pressed="${state.accessoryRegion === region}">${tr(region === 'all' ? 'allPositions' : regionKeys[region])}</button>`).join('');
  filters.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { state.accessoryRegion = button.dataset.accessoryRegion; renderAccessoryFilters(); renderCatalog({ resetScroll: true }); }));
}
function thumbnailKey(item, isPart) { return isPart ? `item:${item.id}` : `look:${item.id}:${colorKey(lookColors(item))}`; }
function cardImage(key, name) { const url = preview?.thumbnails.get(key); return url ? `<img src="${url}" alt="${escape(tr('previewAlt', { name }))}" loading="lazy" draggable="false" />` : `<span class="thumbnail-loading" aria-label="${escape(tr('generating'))}">${icon('shirt')}</span>`; }
function observeCatalog(jobs, onReady) {
  catalogObserver?.disconnect(); cancelAnimationFrame(thumbnailFrame);
  const epoch = ++catalogEpoch, visible = new Map(), jobByKey = new Map(jobs.map(job => [job.key, job]));
  const ready = (key, url) => { if (epoch === catalogEpoch) onReady(key, url); };
  const schedule = () => {
    cancelAnimationFrame(thumbnailFrame);
    thumbnailFrame = requestAnimationFrame(() => preview?.queueThumbnails([...visible.values()], ready));
  };
  preview?.queueThumbnails([], ready);
  const scroll = $('catalog-scroll');
  const root = scroll;
  catalogObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const key = entry.target.dataset.thumbnail, job = jobByKey.get(key);
      if (!job) continue;
      if (entry.isIntersecting) visible.set(key, job); else visible.delete(key);
    }
    schedule();
  }, { root, rootMargin: '220px 0px', threshold: 0 });
  $('outfit-grid').querySelectorAll('[data-thumbnail]').forEach(node => catalogObserver.observe(node));
}
function emptyState(kind) {
  const title = kind === 'saved' ? 'savedEmpty' : kind === 'favorites' ? 'favoriteEmpty' : 'emptyTitle';
  const text = kind === 'saved' ? 'savedEmptyText' : kind === 'favorites' ? 'favoriteEmptyText' : 'emptyText';
  return `<div class="empty-state">${icon(kind === 'saved' ? 'bookmark' : kind === 'favorites' ? 'heart' : 'search')}<h3>${tr(title)}</h3><p>${tr(text)}</p><button class="save-button" id="clear-filters">${tr(kind === 'saved' ? 'browse' : 'clearFilters')}</button></div>`;
}
function renderCatalog({ resetScroll = false } = {}) {
  const saved = state.view === 'saved', grid = $('outfit-grid'), query = state.query.trim().toLowerCase(), isPart = state.slot !== 'all';
  const scroll = $('catalog-scroll'), scrollTop = resetScroll ? 0 : scroll?.scrollTop || 0;
  $('wardrobe-nav').classList.toggle('active', !saved); $('saved-nav').classList.toggle('active', saved);
  $('closet-title').textContent = tr(saved ? 'savedTitle' : 'closetTitle');
  $('filter-favorites').hidden = saved; $('theme-filters').hidden = saved; $('slot-controls').parentElement.hidden = saved;
  if ($('accessory-filters')) $('accessory-filters').hidden = saved || state.slot !== 'accessory';
  $('collection-filter').hidden = saved; $('random-button').hidden = saved;
  $('collection-filter').classList.toggle('active', state.theme !== 'all' || state.favoritesOnly);
  $('filter-favorites').setAttribute('aria-pressed', String(state.favoritesOnly));
  if (saved) {
    const looks = state.saved.filter(look => !query || `${getLookName(look.selection)} ${selectedItemIds(look.selection).map(id => `${itemById.get(id)?.en || ''} ${itemById.get(id)?.name || ''}`).join(' ')}`.toLowerCase().includes(query));
    $('result-count').textContent = `${looks.length} ${tr('savedLabel')}`;
    grid.innerHTML = looks.length ? looks.map(look => {
      const name = getLookName(look.selection), date = new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-GB', { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }).format(Number.isNaN(Date.parse(look.date)) ? new Date() : new Date(look.date));
      return `<article class="outfit-card saved-card" data-saved="${look.id}"><button class="card-open" aria-label="${escape(tr('tryOn', { name }))}"><div class="card-visual" data-thumbnail="saved:${escape(look.id)}" style="--card-bg:#eceee3">${look.thumbnail ? `<img src="${look.thumbnail}" alt="${escape(tr('previewAlt', { name }))}" draggable="false" />` : cardImage(`saved:${look.id}`, name)}</div><div class="card-info"><div><h3 class="card-name" title="${escape(name)}">${escape(name)}</h3><p class="card-subtitle">${escape(date)}</p></div><div class="card-swatches"><i style="background:${look.colors.shell}"></i><i style="background:${look.colors.accent}"></i></div></div></button><button class="card-delete card-heart" aria-label="${escape(tr('deleteSaved', { name }))}">${icon('trash')}</button></article>`;
    }).join('') : emptyState('saved');
    grid.querySelectorAll('[data-saved]').forEach(card => {
      const look = state.saved.find(look => look.id === card.dataset.saved);
      card.querySelector('.card-open').addEventListener('click', () => { changeLook(() => { state.selection = validSelection(look.selection); state.colors = { ...look.colors }; }); preview?.setFraming('full'); toast(tr('restoredToast')); });
      card.querySelector('.card-delete').addEventListener('click', () => { const index = state.saved.indexOf(look); state.saved = state.saved.filter(item => item.id !== look.id); const kept = persist(); refreshLook(); renderCatalog(); if (kept) toast(tr('removedToast'), () => { if (state.saved.length >= 60) { toast(tr('savedLimit')); return; } state.saved.splice(index, 0, look); persist(); refreshLook(); renderCatalog(); }); });
    });
    observeCatalog(looks.filter(look => !look.thumbnail).map(look => ({ key: `saved:${look.id}`, selection: look.selection, options: { colors: look.colors } })), (key, url) => {
      const look = state.saved.find(look => `saved:${look.id}` === key);
      if (!look) return;
      look.thumbnail = url; look.thumbnailVersion = THUMBNAIL_VERSION;
      grid.querySelectorAll('[data-thumbnail]').forEach(node => { if (node.dataset.thumbnail === key && node.querySelector('.thumbnail-loading')) { const image = document.createElement('img'); image.draggable = false; image.src = url; image.alt = tr('previewAlt', { name: getLookName(look.selection) }); node.querySelector('.thumbnail-loading').replaceWith(image); } });
      persist();
    });
  } else {
    const pool = isPart ? ITEMS.filter(item => item.slot === state.slot) : OUTFITS;
    const items = pool.filter(item => (state.theme === 'all' || item.theme === state.theme) && (state.slot !== 'accessory' || state.accessoryRegion === 'all' || item.region === state.accessoryRegion) && (!state.favoritesOnly || state.favorites.has(`${isPart ? 'item' : 'look'}:${item.id}`)) && (!query || `${item.name} ${item.en} ${item.description || ''} ${item.descriptionEn || ''} ${themeById.get(item.theme)?.name} ${themeById.get(item.theme)?.en}`.toLowerCase().includes(query)));
    $('result-count').textContent = `${items.length} ${tr(isPart ? 'piecesLabel' : 'looksLabel')}`;
    grid.innerHTML = items.length ? items.map(item => {
      const selected = isPart ? selectedItemIds(state.selection, item.slot).includes(item.id) : currentLook()?.id === item.id;
      const key = `${isPart ? 'item' : 'look'}:${item.id}`, name = nameOf(item), imageKey = thumbnailKey(item, isPart);
      const slots = isPart ? [item.slot] : SLOT_IDS.filter(slot => selectedItemIds(item.selection, slot).length);
      const swatches = isPart ? (item.palette || []).slice(0, 3) : Object.values(lookColors(item));
      const position = isPart && item.region ? `<span class="card-position">${tr(regionKeys[item.region])}</span>` : '';
      return `<article class="outfit-card${selected ? ' active equipped' : ''}${isPart ? ' item-card' : ''}" ${isPart ? 'data-item' : 'data-outfit'}="${item.id}"><button class="card-open" aria-label="${escape(tr('tryOn', { name }))}" aria-pressed="${selected}"><div class="card-visual" data-thumbnail="${escape(imageKey)}" style="--card-bg:${themeById.get(item.theme)?.color || '#efeddf'}">${cardImage(imageKey, name)}${selected ? `<span class="card-selected card-equipped">${icon('check')} ${tr('wearing')}</span>` : ''}</div><div class="card-info"><div><h3 class="card-name" title="${escape(name)}">${escape(name)}</h3><p class="card-subtitle">${escape(nameOf(themeById.get(item.theme)))}</p></div><div class="card-swatches" aria-label="${escape(tr(isPart ? 'piecePalette' : 'lookBodyColors'))}" title="${escape(tr(isPart ? 'piecePalette' : 'lookBodyColors'))}">${swatches.map(color => `<i style="background:${color}"></i>`).join('')}</div></div><div class="parts-tag">${slots.map(slot => `<span class="item-part" title="${tr(slotKeys[slot])}">${icon(slotIcons[slot])}${!isPart && slot === 'accessory' ? `<small>${selectedItemIds(item.selection, slot).length}</small>` : ''}</span>`).join('')}${position}</div></button><button class="card-heart${state.favorites.has(key) ? ' is-favorite' : ''}" aria-label="${escape(tr(state.favorites.has(key) ? 'unfavorite' : 'favorite', { name }))}" aria-pressed="${state.favorites.has(key)}">${icon('heart')}</button></article>`;
    }).join('') : emptyState(state.favoritesOnly ? 'favorites' : 'search');
    grid.querySelectorAll('[data-outfit], [data-item]').forEach(card => { const part = Boolean(card.dataset.item), id = card.dataset.item || card.dataset.outfit; card.querySelector('.card-open').addEventListener('click', () => part ? selectItem(id) : selectLook(id)); card.querySelector('.card-heart').addEventListener('click', () => toggleFavorite(`${part ? 'item' : 'look'}:${id}`)); });
    observeCatalog(items.map(item => ({ key: thumbnailKey(item, isPart), selection: isPart ? validSelection({ [item.slot]: item.id }) : item.selection, options: { item: isPart, colors: isPart ? DEFAULT_ROBOT_COLORS : lookColors(item) } })), (key, url) => {
      grid.querySelectorAll('[data-thumbnail]').forEach(node => { if (node.dataset.thumbnail === key && node.querySelector('.thumbnail-loading')) { const image = document.createElement('img'); image.draggable = false; image.src = url; image.alt = tr('previewAlt', { name: node.closest('article').querySelector('.card-name').textContent }); image.loading = 'lazy'; node.querySelector('.thumbnail-loading').replaceWith(image); } });
    });
  }
  if (scroll) scroll.scrollTop = scrollTop;
  $('clear-filters')?.addEventListener('click', () => { state.query = ''; state.theme = 'all'; state.accessoryRegion = 'all'; state.favoritesOnly = false; state.view = 'wardrobe'; $('outfit-search').value = ''; $('filter-favorites').setAttribute('aria-pressed', 'false'); renderFilters(); renderAccessoryFilters(); renderCatalog({ resetScroll: true }); });
}
function setView(view) { state.view = view; state.query = ''; $('outfit-search').value = ''; renderAccessoryFilters(); renderCatalog({ resetScroll: true }); }
const PALETTES = [
  { key: 'paletteOrange', ...DEFAULT_ROBOT_COLORS }, { key: 'paletteCream', shell: '#f1e8d5', accent: '#d7aa72' },
  { key: 'paletteMint', shell: '#a3bea5', accent: '#e2e6bd' }, { key: 'paletteBlue', shell: '#99b8cc', accent: '#ede3d2' }, { key: 'paletteRose', shell: '#dcb0ba', accent: '#f3dfc7' },
];
function refreshColors() {
  refreshSharedReceipt();
  $('shell-color').value = state.colors.shell; $('accent-color').value = state.colors.accent;
  $('palette-presets').innerHTML = PALETTES.map((palette, index) => `<button class="palette-preset${colorKey(palette) === colorKey(state.colors) ? ' active' : ''}" data-palette="${index}" style="background:linear-gradient(135deg,${palette.shell} 60%,${palette.accent} 60%)" aria-label="${escape(tr(palette.key))}" title="${escape(tr(palette.key))}" aria-pressed="${colorKey(palette) === colorKey(state.colors)}"></button>`).join('');
  $('palette-presets').querySelectorAll('button').forEach(button => button.addEventListener('click', () => setColors(PALETTES[button.dataset.palette])));
  const look = currentLook(), locked = $('color-lock');
  if (locked) { locked.setAttribute('aria-pressed', String(state.colorLocked)); locked.classList.toggle('active', state.colorLocked); locked.title = tr(state.colorLocked ? 'unlockColorsHint' : 'lockColorsHint'); }
  if ($('apply-look-colors')) { $('apply-look-colors').disabled = !look; $('apply-look-colors').title = tr(look ? 'applyLookPaletteHint' : 'chooseLookPaletteHint'); }
  if ($('color-status')) $('color-status').textContent = tr(state.colorLocked ? 'colorsLocked' : look && colorKey(state.colors) === colorKey(lookColors(look)) ? 'outfitPalette' : 'yourPalette');
}
function setColors(colors, { group, locked = true } = {}) { changeLook(() => { state.colors = normalizeRobotColors(colors); state.colorLocked = locked; }, { group, geometry: false }); }
function setMotion() { preview?.setMotion(state.bouncing); $('motion-toggle').classList.toggle('active', state.bouncing); $('motion-toggle').setAttribute('aria-pressed', String(state.bouncing)); $('motion-label').textContent = tr(state.bouncing ? 'motionOn' : 'motionOff'); }
function playAction(action) { preview?.trigger(action); $('moves-panel').open = false; $('moves-panel').querySelector('summary').focus({ preventScroll: true }); }
function renderExtraActions() {
  const menu = $('extra-action-menu'); if (!menu) return;
  menu.innerHTML = ACTIONS.filter(action => !action.featured && action.id !== 'rest').map(action => `<button data-action="${action.id}" title="${escape(state.language === 'zh' ? action.zh : action.en)}"><span>${icon('sparkles')}</span><span>${escape(state.language === 'zh' ? action.zh : action.en)}</span></button>`).join('');
  menu.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => { playAction(button.dataset.action); menu.closest('details').open = false; }));
}
function updateFrameButton(mode = preview?.getFraming() || 'full') { $('frame-camera').textContent = tr(mode === 'portrait' ? 'fullLook' : 'closeUp'); $('frame-camera').setAttribute('aria-pressed', String(mode === 'portrait')); }
function setLanguage(language) { state.language = language; applyLanguage(language); renderSlots(); renderFilters(); renderAccessoryFilters(); renderExtraActions(); refreshLook(); refreshColors(); renderCatalog(); setMotion(); preview?.setLabel(tr('canvasLabel')); updateFrameButton(); persist(); }
function showInfo(content) { $('app-more').open = false; $('dialog-content').innerHTML = content; $('info-dialog').showModal(); }
function hydrateIcons() { document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); }); }
$('frame-camera').addEventListener('click', () => preview?.setFraming(preview.getFraming() === 'portrait' ? 'full' : 'portrait'));
const studioPanels = [...document.querySelectorAll('.studio-panel, .app-more, .wearing-panel, .collection-filter')];
for (const panel of studioPanels) panel.addEventListener('toggle', () => {
  if (panel.open) for (const other of studioPanels) if (other !== panel) other.open = false;
});
document.addEventListener('click', event => {
  for (const panel of studioPanels) if (!panel.contains(event.target)) panel.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') for (const panel of studioPanels) if (panel.open) { panel.open = false; panel.querySelector('summary').focus(); }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !event.altKey &&
      !event.target.closest('input, textarea, [contenteditable="true"]') && !$('info-dialog').open && !$('playground-dialog').open) {
    event.preventDefault(); undoLook();
  }
});
hydrateIcons();
$('info-dialog').addEventListener('close', () => $('app-more').querySelector('summary').focus({ preventScroll: true }));
$('dialog-close').addEventListener('click', () => $('info-dialog').close());
$('info-dialog').addEventListener('click', event => { if (event.target === $('info-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('about-button').addEventListener('click', () => showInfo(`<div class="dialog-kicker">HELLO, LITTLE DUCK.</div><h2>${tr('aboutTitle')}</h2><p>${tr('aboutText')}</p><p>${tr('aboutStorage')}</p><p class="dialog-note">${tr('aboutNote')}</p>`));
$('source-button').addEventListener('click', () => showInfo(`<div class="dialog-kicker">BUILT WITH OPEN SOURCE</div><h2>${tr('sourceTitle')}</h2><p>${tr('sourceText')}</p><p><a href="https://github.com/ruziniuuuuu/DuckRobe" target="_blank" rel="noopener noreferrer" aria-label="${escape(tr('githubRepository'))}">${tr('projectRepository')} ↗</a></p><p><a href="https://github.com/pollen-robotics/microduck_rl" target="_blank" rel="noopener noreferrer">Microduck RL ↗</a></p><p><a href="https://huggingface.co/spaces/pollen-robotics/microduck-simulator" target="_blank" rel="noopener noreferrer">Microduck simulator ↗</a></p><p class="dialog-note">${tr('sourceNote')}</p>`));
$('wardrobe-nav').addEventListener('click', () => setView('wardrobe')); $('saved-nav').addEventListener('click', () => setView('saved'));
$('outfit-search').addEventListener('input', event => { state.query = event.target.value; renderCatalog({ resetScroll: true }); });
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('info-dialog').open && !$('playground-dialog').open) { event.preventDefault(); $('outfit-search').focus(); } });
$('filter-favorites').addEventListener('click', () => {
  state.favoritesOnly = !state.favoritesOnly;
  $('filter-favorites').setAttribute('aria-pressed', String(state.favoritesOnly));
  renderCatalog({ resetScroll: true });
  $('collection-filter').open = false;
});
$('clear-look').addEventListener('click', () => { changeLook(() => { state.selection = validSelection({}); }); toast(tr('clearToast')); });
$('random-button').addEventListener('click', () => { const pool = (state.slot === 'all' ? OUTFITS : ITEMS.filter(item => item.slot === state.slot)).filter(item => (state.theme === 'all' || item.theme === state.theme) && (state.slot !== 'accessory' || state.accessoryRegion === 'all' || item.region === state.accessoryRegion)); const alternatives = pool.filter(item => state.slot === 'all' ? item.id !== currentLook()?.id : !selectedItemIds(state.selection).includes(item.id)); const choice = alternatives[Math.floor(Math.random() * alternatives.length)]; if (choice) state.slot === 'all' ? selectLook(choice.id) : selectItem(choice.id); toast(tr('randomToast')); });
$('motion-toggle').addEventListener('click', () => { state.bouncing = !state.bouncing; setMotion(); });
$('jump-button')?.addEventListener('click', () => preview?.trigger('hop'));
$('pet-action-menu').querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => playAction(button.dataset.action)));
$('reset-camera').addEventListener('click', () => preview?.resetCamera());
for (const channel of ['shell', 'accent']) {
  const input = $(`${channel}-color`);
  input.addEventListener('input', event => setColors({ ...state.colors, [channel]: event.target.value }, { group: channel }));
  for (const event of ['change', 'blur']) input.addEventListener(event, () => { colorGesture = null; });
}
$('reset-colors').addEventListener('click', () => setColors(DEFAULT_ROBOT_COLORS));
$('color-lock')?.addEventListener('click', () => { changeLook(() => { state.colorLocked = !state.colorLocked; }, { geometry: false }); });
$('apply-look-colors')?.addEventListener('click', () => { const look = currentLook(); if (look) setColors(lookColors(look), { locked: false }); });
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
$('save-look').addEventListener('click', () => {
  if (!preview) { toast(tr('readyToast')); return; }
  if (state.saved.some(look => selectionKey(look.selection) === selectionKey(state.selection) && colorKey(look.colors) === colorKey(state.colors))) { toast(tr('duplicateToast')); return; }
  if (state.saved.length >= 60) { toast(tr('savedLimit')); return; }
  state.saved.unshift({ id: `look-${crypto.randomUUID()}`, selection: validSelection(state.selection), colors: { ...state.colors }, date: new Date().toISOString(), thumbnail: preview.makeThumbnail(state.selection, { colors: state.colors }), thumbnailVersion: THUMBNAIL_VERSION });
  const kept = persist(); refreshLook(); renderCatalog(); if (kept) toast(tr('savedToast'));
});
$('share-look').addEventListener('click', async () => {
  const link = createLookLink({ selection: state.selection, colors: state.colors });
  try {
    await navigator.clipboard.writeText(link);
    $('app-more').open = false; $('app-more').querySelector('summary').focus(); toast(tr('linkCopied'));
  } catch {
    showInfo(`<h2>${tr('shareLook')}</h2><p>${tr('copyLinkHelp')}</p><input class="share-link-field" id="share-link-field" readonly aria-label="${tr('shareLook')}" value="${escape(link)}" />`);
    $('share-link-field').focus(); $('share-link-field').select();
  }
});
$('export-look').disabled = true;
$('export-look').addEventListener('click', async () => {
  if (!preview || exporting) return;
  exporting = true; const button = $('export-look'); button.disabled = true; button.querySelector('[data-i18n="exportLook"]').textContent = tr('exporting');
  try { await exportLook({ robot: preview.rig, selection: validSelection(state.selection), colors: { ...state.colors }, outfitName: getLookName() }); toast(tr('exported')); }
  catch (error) { console.error(error); toast(tr('exportError', { message: error.message })); }
  finally { exporting = false; button.disabled = false; button.querySelector('[data-i18n="exportLook"]').textContent = tr('exportLook'); }
});
const catalogScroll = $('catalog-scroll');
catalogScroll?.addEventListener('dragstart', event => event.preventDefault());
let dragGesture, ignoreClickUntil = 0;
function finishCatalogDrag() {
  if (!dragGesture) return;
  if (dragGesture.active) ignoreClickUntil = performance.now() + 350;
  const pointerId = dragGesture.id; dragGesture = null;
  catalogScroll?.classList.remove('is-dragging');
  if (catalogScroll?.hasPointerCapture(pointerId)) catalogScroll.releasePointerCapture(pointerId);
}
catalogScroll?.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || catalogScroll.scrollHeight <= catalogScroll.clientHeight || event.target.closest('.card-heart, a, input')) return;
  dragGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, scrollTop: catalogScroll.scrollTop, active: false };
});
catalogScroll?.addEventListener('pointermove', event => {
  if (!dragGesture || event.pointerId !== dragGesture.id) return;
  const dy = event.clientY - dragGesture.y, dx = event.clientX - dragGesture.x;
  if (!dragGesture.active && (Math.abs(dy) < 8 || Math.abs(dy) <= Math.abs(dx))) return;
  if (!dragGesture.active) { dragGesture.active = true; catalogScroll.setPointerCapture(event.pointerId); catalogScroll.classList.add('is-dragging'); }
  event.preventDefault(); window.getSelection()?.removeAllRanges();
  catalogScroll.scrollTop = dragGesture.scrollTop - dy;
});
catalogScroll?.addEventListener('pointerup', finishCatalogDrag);
catalogScroll?.addEventListener('pointercancel', finishCatalogDrag);
catalogScroll?.addEventListener('lostpointercapture', finishCatalogDrag);
catalogScroll?.addEventListener('click', event => { if (performance.now() < ignoreClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
window.addEventListener('pointerup', finishCatalogDrag);
document.addEventListener('click', event => { if (!event.target.closest('.more-actions')) document.querySelector('.more-actions')?.removeAttribute('open'); });
// This overlay deliberately leaves the catalog's view/filter state and DOM
// mounted. setView() would clear search and reset the catalog scroll.
let playground, playgroundVisit = 0, wardrobeReturn;
const playgroundDialog = $('playground-dialog');
function closePlayground() {
  if (!playgroundDialog.open) return;
  playgroundVisit++; playground?.dispose(); playground = null;
  if (window.duckrobe) window.duckrobe.playground = null;
  playgroundDialog.close(); $('playground-host').replaceChildren();
  document.body.style.overflow = wardrobeReturn.overflow;
  preview?.setSuspended(false);
  $('catalog-scroll').scrollTop = wardrobeReturn.catalogTop;
  scrollTo(wardrobeReturn.x, wardrobeReturn.y);
  wardrobeReturn.focus?.focus({ preventScroll: true });
}
async function openPlayground() {
  if (!preview || playgroundDialog.open) return;
  const visit = ++playgroundVisit;
  wardrobeReturn = { overflow: document.body.style.overflow, x: scrollX, y: scrollY, catalogTop: $('catalog-scroll').scrollTop, focus: document.activeElement };
  studioPanels.forEach(panel => { panel.open = false; });
  preview.setSuspended(true); document.body.style.overflow = 'hidden';
  const host = $('playground-host');
  host.innerHTML = `<div class="playground-opening"><button id="playground-opening-back">← ${tr('playgroundBack')}</button><p>${tr('playgroundLoading')}</p></div>`;
  $('playground-opening-back').addEventListener('click', closePlayground);
  playgroundDialog.showModal();
  try {
    const { createPlayground } = await import('./playground/index.js');
    if (visit !== playgroundVisit || !playgroundDialog.open) return;
    playground = createPlayground({ host, selection: structuredClone(state.selection), colors: { ...state.colors }, language: state.language, sourceRig: preview.rig, lookName: getLookName(), onExit: closePlayground,
      onWear: photo => { closePlayground(); wearLook(photo); } });
    window.duckrobe.playground = playground;
  } catch (error) {
    if (visit !== playgroundVisit || !playgroundDialog.open) return;
    const opening = host.querySelector('.playground-opening');
    if (opening) {
      opening.querySelector('p').textContent = `${tr('playgroundErrorHelp')} ${error.message}`;
      const retry = document.createElement('button'); retry.textContent = tr('retry'); opening.append(retry);
      retry.addEventListener('click', () => { closePlayground(); void openPlayground(); });
    }
  }
}
$('open-playground').addEventListener('click', openPlayground);
playgroundDialog.addEventListener('cancel', event => { event.preventDefault(); closePlayground(); });
function receiveLook(look) {
  if (!look) { toast(tr('sharedLookInvalid')); return; }
  closePlayground(); sharedReceipt = look; wearLook(look);
  const url = new URL(location.href), params = new URLSearchParams(url.hash.slice(1));
  params.delete('look'); url.hash = params.toString(); history.replaceState(history.state, '', url);
  toast(tr('sharedLookReceived'));
}
window.addEventListener('hashchange', () => { const look = readSharedLook(location.hash); if (look !== undefined) receiveLook(look); });
setLanguage(state.language);
if (receivedLook !== undefined) receiveLook(receivedLook);
createPreview({ viewer: $('viewer'), onFraming: updateFrameButton, colors: state.colors, selection: state.selection, onReaction: () => {
  const bubble = $('pet-reaction'); bubble.hidden = false; bubble.textContent = ['♡', '✦', '♪'][Math.floor(Math.random() * 3)]; clearTimeout(reactionTimer); reactionTimer = setTimeout(() => { bubble.hidden = true; }, 1700);
} }).then(result => {
  preview = result;
  // Controls remain usable during asset loading; apply their latest values.
  preview.setColors(state.colors); preview.setSelection(state.selection); preview.setLabel(tr('canvasLabel')); setMotion();
  const look = currentLook();
  preview.thumbnails.set(look && colorKey(state.colors) === colorKey(lookColors(look)) ? thumbnailKey(look, false) : 'initial-preview', preview.makeThumbnail(state.selection, { colors: state.colors }));
  $('viewer-loading').hidden = true; $('save-look').disabled = false; $('export-look').disabled = false; $('open-playground').disabled = false; renderCatalog();
  window.duckrobe = { ready: true, state, rig: preview.rig, OUTFITS, ITEMS, THEMES, SLOT_IDS, ACCESSORY_REGIONS, ACTIONS, normalizeSelection, selectedItemIds, selectionKey, selectLook, selectItem, preview, thumbnails: preview.thumbnails, getLookName };
}).catch(error => {
  console.error(error);
  $('viewer-loading').innerHTML = `${icon('duck')}<strong>${tr('renderError')}</strong><span>${escape(error.message)}</span><button class="save-button" id="retry-viewer">${tr('retry')}</button>`;
  $('retry-viewer').addEventListener('click', () => location.reload());
});
