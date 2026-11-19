import { campaignCounts, campaignFields, copyTemplate, limits, readCampaigns, storageKey, trackingLink, visibleCampaigns } from './studio.mjs';

const byId = (id) => document.getElementById(id);
const form = byId('campaign-form');
const dialog = byId('campaign-dialog');
const confirmation = byId('confirm-dialog');
const campaignList = byId('campaign-list');
const search = byId('search-campaigns');
const filter = byId('filter-status');
const draft = byId('draft');
const linkForm = byId('link-form');
const linkOutput = byId('tracking-url');
const copyLinkButton = byId('copy-link');
const campaignError = byId('campaign-error');
const linkError = byId('link-error');
const notification = byId('notification');
const draftNotice = byId('draft-notice');
const newButton = document.querySelector('[data-new]');
const pages = { campaigns: 'Campaigns', links: 'Link builder', brand: 'Brand guide' };
const channelIcons = { Email: 'mail', Social: 'chat', 'Landing page': 'globe' };
const fields = [...Object.keys(limits), 'channel', 'status'];
let editingId;
let initialFields;
let campaignOpener;
let campaigns = [];
let noticeTimer;
let currentPage;

function showPage() {
  const hash = location.hash.slice(1);
  const page = Object.hasOwn(pages, hash) ? hash : hash === 'main' ? currentPage || 'campaigns' : 'campaigns';
  for (const key of Object.keys(pages)) {
    byId(`page-${key}`).hidden = key !== page;
    const link = document.querySelector(`[data-page="${key}"]`);
    if (key === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  byId('page-label').textContent = pages[page];
  document.title = `${pages[page]} · Flow Marketing Studio`;
  if (currentPage && page !== currentPage) {
    const heading = byId(`${page}-heading`);
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  currentPage = page;
}

function displayMessage(element, text = '') {
  element.hidden = !text;
  element.textContent = text;
}

function notify(message, element = notification) {
  window.clearTimeout(noticeTimer);
  for (const other of [notification, draftNotice]) {
    if (other !== element) displayMessage(other);
  }
  displayMessage(element, message);
  noticeTimer = window.setTimeout(() => displayMessage(element), 4500);
}

function makeNode(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function icon(id, className = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const graphic = document.createElementNS(ns, 'svg');
  graphic.setAttribute('class', `icon ${className}`);
  graphic.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  graphic.append(use);
  return graphic;
}

function campaignRow(row) {
  const button = makeNode('button', 'campaign-row');
  button.type = 'button';
  button.dataset.id = row.id;
  const channel = makeNode('span', 'icon-box');
  channel.append(icon(channelIcons[row.channel]));
  const text = makeNode('span', 'row-text');
  text.append(makeNode('strong', '', row.title), makeNode('small', '', row.channel + (row.example ? ' · Example' : '')));
  button.append(channel, text, makeNode('span', `status ${row.status.toLowerCase().replace(' ', '-')}`, row.status), icon('chevron', 'row-chevron'));
  return button;
}

function refreshList() {
  const results = visibleCampaigns(campaigns, search.value, filter.value);
  const counts = campaignCounts(campaigns);
  for (const [key, count] of Object.entries(counts)) byId(`count-${key}`).textContent = count;
  const empty = campaigns.length ? 'No campaigns match these filters.' : 'No campaigns yet. Create one to get started.';
  campaignList.replaceChildren(...(results.length ? results.map(campaignRow) : [makeNode('p', 'empty', empty)]));
  const count = results.length;
  const examples = campaigns.filter((campaign) => campaign.example).length;
  byId('list-summary').textContent = `${count} of ${campaigns.length} campaigns${examples ? ' · Includes example campaigns' : ''}`;
}

function storedCampaigns() {
  return readCampaigns(localStorage.getItem(storageKey));
}

function refreshFromStorage() {
  try {
    campaigns = storedCampaigns();
  } catch {
    notify('Saved campaigns are unavailable in this browser.');
  }
  refreshList();
}

function saveCampaigns(transform) {
  try {
    const next = transform(storedCampaigns());
    localStorage.setItem(storageKey, JSON.stringify(next));
    campaigns = next;
    return true;
  } catch {
    displayMessage(campaignError, 'Could not update browser storage. Your saved campaigns were not changed.');
    return false;
  }
}

function formValues(element) {
  return Object.fromEntries(new FormData(element));
}

function editFields() {
  return fields.map((field) => form.elements.namedItem(field).value);
}

function updateDraftButtons() {
  const hasDraft = Boolean(draft.value.trim());
  byId('insert-template').disabled = hasDraft;
  byId('copy-draft').disabled = !hasDraft;
}

function openEditor(row, opener) {
  form.reset();
  editingId = row?.id;
  campaignOpener = opener;
  byId('dialog-heading').textContent = row ? 'Edit campaign' : 'New campaign';
  byId('delete-campaign').hidden = !row;
  for (const field of fields) {
    if (row) form.elements.namedItem(field).value = row[field];
  }
  initialFields = editFields();
  displayMessage(campaignError);
  displayMessage(draftNotice);
  updateDraftButtons();
  dialog.showModal();
  form.querySelector('.dialog-body').scrollTop = 0;
}

function confirmAction(title, description, action, cancel, callback) {
  byId('confirm-heading').textContent = title;
  byId('confirm-description').textContent = description;
  byId('confirm-action').textContent = action;
  confirmation.querySelector('[value="cancel"]').textContent = cancel;
  confirmation.returnValue = '';
  confirmation.addEventListener('close', () => {
    if (confirmation.returnValue === 'confirm') callback();
  }, { once: true });
  confirmation.showModal();
}

function closeEditor() {
  if (editFields().every((value, index) => value === initialFields[index])) dialog.close();
  else confirmAction('Discard unsaved changes?', 'Changes since you last saved will be lost.', 'Discard changes', 'Keep editing', () => dialog.close());
}

async function copyText(field, message, notice = notification) {
  try {
    await navigator.clipboard.writeText(field.value);
    notify(message, notice);
  } catch {
    field.focus();
    field.select();
    notify('Text selected. Use your device’s Copy command.', notice);
  }
}

byId('close-dialog').addEventListener('click', closeEditor);
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeEditor();
});
dialog.addEventListener('close', () => {
  const replacement = Array.from(campaignList.children).find((button) => button.dataset.id === campaignOpener?.dataset.id && button.tagName === 'BUTTON');
  const focusTarget = campaignOpener?.isConnected ? campaignOpener : replacement || newButton;
  focusTarget.focus();
});
newButton.addEventListener('click', () => openEditor(null, newButton));
campaignList.addEventListener('click', (event) => {
  const button = event.target.closest('.campaign-row');
  if (button) openEditor(campaigns.find((row) => row.id === button.dataset.id), button);
});
search.addEventListener('input', refreshList);
filter.addEventListener('change', refreshList);
draft.addEventListener('input', updateDraftButtons);
byId('copy-draft').addEventListener('click', () => copyText(draft, 'Draft copied.', draftNotice));
byId('insert-template').addEventListener('click', () => {
  if (draft.value.trim()) return;
  draft.value = copyTemplate(formValues(form));
  updateDraftButtons();
  draft.focus();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  displayMessage(campaignError);
  let values;
  try {
    values = campaignFields(formValues(form));
  } catch (error) {
    displayMessage(campaignError, error.message);
    return;
  }
  const id = editingId ?? crypto.randomUUID();
  if (saveCampaigns((list) => {
    if (editingId) {
      if (!list.some((row) => row.id === id)) throw new Error('Campaign no longer exists.');
      return list.map((row) => row.id === id ? { ...row, ...values } : row);
    }
    return [{ ...values, id, example: false }, ...list];
  })) {
    if (!editingId) search.value = filter.value = '';
    refreshList();
    dialog.close();
    notify(editingId ? 'Campaign updated.' : 'Campaign created.');
  }
});
byId('delete-campaign').addEventListener('click', () => {
  confirmAction('Delete this campaign?', 'The saved brief and draft will be removed from this browser.', 'Delete campaign', 'Keep campaign', () => {
    if (saveCampaigns((list) => list.filter((row) => row.id !== editingId))) {
      refreshList();
      dialog.close();
      notify('Campaign deleted.');
    }
  });
});

function clearLink() {
  displayMessage(linkError);
  linkOutput.value = '';
  copyLinkButton.disabled = true;
}

linkForm.addEventListener('input', clearLink);
linkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearLink();
  try {
    linkOutput.value = trackingLink(formValues(linkForm));
    copyLinkButton.disabled = false;
    notify('Tracking link generated.');
  } catch (error) {
    displayMessage(linkError, error.message);
  }
});
copyLinkButton.addEventListener('click', () => copyText(linkOutput, 'Tracking link copied.'));
window.addEventListener('hashchange', showPage);
window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) refreshFromStorage();
});
showPage();
refreshFromStorage();
