import {
  campaignCounts, campaignFields, campaignVariant, configuredFlowUrl, copyTemplate, createBackup, emailDraftPreview,
  captionLength, exceedsCaptionLimit, formatBrief, groupCampaigns, importBackup, isFlowDestination, isSocial,
  launchKey, limits, linkHistoryCsv, missingReadyFields, platformLimits, readWorkspace, readinessFields,
  saveCampaignChannel, scheduleFields, socialWeekCsv, storageKey, trackingDefaults, trackingLink, visibleCampaigns,
  weekDates, weeklySocialPosts,
} from './studio.mjs';
import { readMedia, updateMedia } from './media.mjs';

const byId = (id) => document.getElementById(id);
const form = byId('campaign-form');
const dialog = byId('campaign-dialog');
const confirmation = byId('confirm-dialog');
const campaignList = byId('campaign-list');
const exampleList = byId('example-list');
const search = byId('search-campaigns');
const filter = byId('filter-status');
const draft = byId('draft');
const linkForm = byId('link-form');
const destination = linkForm.elements.namedItem('destination');
const linkOutput = byId('tracking-url');
const linkAssociation = byId('link-association');
const destinationWarning = byId('destination-warning');
const searchLinks = byId('search-links');
const exportLinks = byId('export-links');
const copyLinkButton = byId('copy-link');
const saveLinkButton = byId('save-link');
const trackingError = byId('tracking-error');
const trackingNotice = byId('tracking-notice');
const campaignError = byId('campaign-error');
const linkError = byId('link-error');
const notification = byId('notification');
const draftNotice = byId('draft-notice');
const newButton = document.querySelector('[data-new]');
const pages = { campaigns: 'Campaigns', calendar: 'Calendar', links: 'Link builder', brand: 'Brand guide' };
const fields = [...Object.keys(limits), 'channel', 'status', 'destination', ...scheduleFields];
const dayLabel = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const mediumDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mediaInput = byId('media-input');
let editingId;
let editingLaunch;
let initialFields;
let campaignOpener;
let campaigns = [];
let links = [];
let noticeTimer;
let currentPage;
let calendarDate = today();
let weekOffset = 0;
let mediaFiles = [];
let mediaUrls = [];
let mediaToken = 0;
let mediaPending = false;

function today() {
  const now = new Date();
  return new Date(+now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

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
    displayMessage(notification);
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

function campaignRow(row, grouped = false) {
  const button = makeNode('button', 'campaign-row');
  button.type = 'button';
  button.dataset.id = row.id;
  const channel = makeNode('span', 'icon-box');
  channel.append(icon(row.channel === 'Email' ? 'mail' : isSocial(row.channel) ? 'chat' : 'globe'));
  const text = makeNode('span', 'row-text');
  text.append(makeNode('strong', '', grouped ? row.channel : row.title));
  if (!grouped) text.append(makeNode('small', '', row.channel + (row.example ? ' · Example' : '')));
  button.append(channel, text, makeNode('span', `status ${row.status.toLowerCase().replace(' ', '-')}`, row.status), icon('chevron', 'row-chevron'));
  return button;
}

function refreshList() {
  const work = campaigns.filter((campaign) => !campaign.example);
  const examples = campaigns.filter((campaign) => campaign.example);
  const results = visibleCampaigns(work, search.value, filter.value);
  const groups = groupCampaigns(work);
  const matching = groupCampaigns(results);
  const counts = campaignCounts(campaigns);
  for (const [key, count] of Object.entries(counts)) byId(`count-${key}`).textContent = count;
  const empty = work.length ? 'No campaigns match these filters.' : 'No campaigns yet. Start from scratch or try an example below.';
  const rows = [...matching].map(([key, channels]) => {
    if (groups.get(key).length === 1) return campaignRow(channels[0]);
    const group = makeNode('section', 'launch-group');
    const heading = makeNode('h3', 'launch-heading', channels[0].title);
    group.setAttribute('aria-label', channels[0].title);
    group.append(heading, ...channels.map((row) => campaignRow(row, true)));
    return group;
  });
  campaignList.replaceChildren(...(rows.length ? rows : [makeNode('p', 'empty', empty)]));
  exampleList.replaceChildren(...examples.map((row) => campaignRow(row)));
  byId('examples').hidden = !examples.length;
  byId('list-summary').textContent = `${matching.size} of ${groups.size} campaigns`;
  refreshLinkAssociations(work);
  refreshHistory();
  refreshCalendar();
}

function storedWorkspace() {
  return readWorkspace(localStorage.getItem(storageKey));
}

function refreshFromStorage() {
  try {
    ({ campaigns, links } = storedWorkspace());
  } catch {
    notify('Saved campaigns are unavailable in this browser.');
  }
  refreshList();
}

function saveWorkspace(transform, errorTarget = campaignError) {
  try {
    const next = transform(storedWorkspace());
    localStorage.setItem(storageKey, JSON.stringify({ ...next, version: 1 }));
    ({ campaigns, links } = next);
    return true;
  } catch {
    displayMessage(errorTarget, 'Could not save changes in this browser. Existing work was not changed.');
    return false;
  }
}

function saveCampaigns(transform) {
  return saveWorkspace((workspace) => ({ ...workspace, campaigns: transform(workspace.campaigns) }));
}

function formValues(element) {
  return Object.fromEntries(new FormData(element));
}

function editFields() {
  return fields.map((field) => form.elements.namedItem(field).value);
}

function updateDraftButtons() {
  const hasDraft = Boolean(draft.value.trim());
  byId('insert-template').textContent = hasDraft ? 'Regenerate from brief' : 'Insert copy template';
  byId('copy-draft').disabled = !hasDraft;
  const channel = form.elements.namedItem('channel').value;
  const maxCaption = Object.hasOwn(platformLimits, channel) ? platformLimits[channel] : null;
  const length = draft.value.trim().length;
  const overLimit = length > limits.draft;
  const postLength = maxCaption ? captionLength(channel, draft.value) : 0;
  byId('draft-length').textContent = maxCaption
    ? `${postLength.toLocaleString('en')} / ${maxCaption.toLocaleString('en')} ${channel} ${channel === 'X' ? 'weighted characters' : 'characters'}`
    : `${length.toLocaleString('en')} / ${limits.draft.toLocaleString('en')} characters`;
  displayMessage(byId('draft-limit'), overLimit ? 'Draft is over the workspace limit. No text has been removed; shorten it before saving.'
    : maxCaption && postLength > maxCaption ? `Over the ${channel} limit. Shorten the caption before marking it Ready.` : '');
  refreshEmailPreview();
  refreshSocialPreview();
}

function refreshEmailPreview() {
  const preview = byId('email-preview');
  preview.hidden = form.elements.namedItem('channel').value !== 'Email' || !draft.value.trim();
  if (preview.hidden || !preview.open) return;
  const { headers, body } = emailDraftPreview(draft.value);
  const content = byId('email-preview-content');
  content.replaceChildren(makeNode('strong', '', headers.subject || '(No subject)'),
    makeNode('p', 'muted', `From: ${headers.from || 'Not set'}`),
    ...(headers['preview text'] ? [makeNode('p', 'muted', headers['preview text'])] : []),
    makeNode('p', 'email-preview-body', body));
}

function updateChannelOptions() {
  const occupied = campaigns.filter((row) => row.id !== editingId && launchKey(row) === editingLaunch).map((row) => row.channel);
  const select = form.elements.namedItem('channel');
  for (const option of select.options) option.disabled = occupied.includes(option.value);
  if (select.selectedOptions[0]?.disabled) select.value = [...select.options].find((option) => !option.disabled)?.value || '';
  byId('duplicate-campaign').disabled = [...select.options].filter((option) => !option.disabled).length <= 1;
  displayMessage(byId('shared-brief-note'), occupied.length || (editingLaunch && !editingId)
    ? 'This launch shares its brief across channels. Each channel keeps its own draft, status, and tracking links.' : '');
}

function resetMedia() {
  mediaToken++;
  mediaFiles = [];
  mediaPending = false;
  mediaInput.disabled = false;
  mediaInput.value = '';
  byId('social-preview').open = false;
  displayMessage(byId('media-error'));
  renderMedia();
}

async function loadMedia() {
  const id = editingId;
  const token = mediaToken;
  mediaInput.disabled = true;
  try {
    const files = await readMedia(id);
    if (token !== mediaToken) return;
    mediaFiles = files;
    mediaInput.disabled = false;
    renderMedia();
  } catch {
    if (token === mediaToken) displayMessage(byId('media-error'), 'Draft media is unavailable in this browser.');
  }
}

function renderMedia() {
  for (const url of mediaUrls) URL.revokeObjectURL(url);
  mediaUrls = [];
  const preview = byId('media-preview');
  if (!byId('social-preview').open) {
    preview.replaceChildren();
    return;
  }
  preview.replaceChildren(...mediaFiles.map((file, index) => {
    const item = makeNode('figure', 'media-item');
    const url = URL.createObjectURL(file);
    mediaUrls.push(url);
    const node = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
    node.src = url;
    if (node.tagName === 'VIDEO') {
      node.controls = true;
      node.playsInline = true;
      node.preload = 'metadata';
    } else {
      node.alt = `Draft image ${index + 1}`;
    }
    node.addEventListener('error', () => { node.replaceWith(makeNode('p', 'muted hint', 'This browser cannot preview this file.')); });
    const remove = makeNode('button', 'button secondary small', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.disabled = mediaPending;
    remove.addEventListener('click', () => changeMedia(mediaFiles.filter((_, candidate) => candidate !== index)));
    item.append(node, makeNode('figcaption', '', file.name), remove);
    return item;
  }));
}

async function changeMedia(files) {
  if (mediaPending || !editingId) return;
  const token = mediaToken;
  mediaPending = mediaInput.disabled = true;
  displayMessage(byId('media-error'));
  try {
    await updateMedia(editingId, files);
    if (token === mediaToken) {
      mediaFiles = files;
      byId('social-preview').open = true;
    }
  } catch (error) {
    if (token === mediaToken) displayMessage(byId('media-error'), error instanceof DOMException ? 'Could not save media in this browser.' : (error?.message || 'Could not save media.'));
  } finally {
    if (token === mediaToken) {
      mediaPending = mediaInput.disabled = false;
      renderMedia();
    }
  }
}

function refreshSocialPreview() {
  const channel = form.elements.namedItem('channel').value;
  const social = isSocial(channel);
  byId('social-schedule').hidden = byId('social-media').hidden = !social;
  for (const field of scheduleFields) form.elements.namedItem(field).disabled = !social;
  if (!social) return;
  byId('media-input-label').hidden = !editingId;
  byId('media-hint').textContent = editingId ? 'Up to 10 files and 30 MB per draft. Media saves immediately to this browser and is not exported.'
    : 'Save the draft before attaching images or video.';
  byId('social-preview-label').textContent = `Preview ${channel === 'Social' ? 'social' : channel} post`;
  byId('preview-platform').textContent = channel;
  byId('preview-caption').textContent = draft.value.trim() || 'Caption will appear here.';
  byId('preview-platform').parentElement.dataset.platform = channel;
}

function openEditor(row, opener, defaults = {}) {
  form.reset();
  editingId = row?.example ? undefined : row?.id;
  editingLaunch = editingId ? launchKey(row) : undefined;
  campaignOpener = opener;
  byId('dialog-heading').textContent = row?.example ? 'Use example campaign' : row ? 'Edit campaign' : 'New campaign';
  byId('delete-campaign').hidden = !editingId;
  byId('campaign-link').hidden = !editingId;
  byId('duplicate-campaign').hidden = !editingId;
  byId('campaign-link').textContent = row?.trackingUrl ? 'Build another link' : 'Build tracking link';
  byId('saved-link-field').hidden = !row?.trackingUrl;
  byId('saved-campaign-link').value = row?.trackingUrl || '';
  byId('brief-output-label').hidden = true;
  byId('email-preview').open = false;
  for (const field of fields) {
    const value = row ? row[field] : defaults[field];
    if (row || value !== undefined) form.elements.namedItem(field).value = value ?? '';
  }
  if (row?.example) form.elements.namedItem('status').value = 'Draft';
  updateChannelOptions();
  resetMedia();
  if (editingId && isSocial(row.channel)) loadMedia();
  initialFields = editFields();
  displayMessage(campaignError);
  displayMessage(draftNotice);
  updateDraftContext();
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

function withEditorClosed(callback = () => {}) {
  const close = () => {
    dialog.close();
    callback();
  };
  if (editFields().every((value, index) => value === initialFields[index])) close();
  else confirmAction('Discard unsaved changes?', 'Changes since you last saved will be lost.', 'Discard changes', 'Keep editing', close);
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

byId('close-dialog').addEventListener('click', () => withEditorClosed());
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  withEditorClosed();
});
dialog.addEventListener('close', () => {
  resetMedia();
  const replacement = [...byId(`page-${currentPage}`).querySelectorAll('.campaign-row, .calendar-post')]
    .find((button) => button.dataset.id === campaignOpener?.dataset.id);
  const focusTarget = campaignOpener?.isConnected ? campaignOpener : replacement || (currentPage === 'calendar' ? byId('new-post') : newButton);
  focusTarget.focus();
});
newButton.addEventListener('click', () => openEditor(null, newButton));
byId('new-post').addEventListener('click', (event) => openEditor(null, event.currentTarget, { channel: 'X' }));
for (const list of [campaignList, exampleList]) {
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.campaign-row');
    if (button) openEditor(campaigns.find((row) => row.id === button.dataset.id), button);
  });
}
search.addEventListener('input', refreshList);
filter.addEventListener('change', refreshList);
draft.addEventListener('input', updateDraftButtons);
byId('copy-draft').addEventListener('click', () => copyText(draft, 'Draft copied.', draftNotice));
byId('copy-brief').addEventListener('click', async () => {
  const values = formValues(form);
  if (!values.title.trim()) {
    displayMessage(campaignError, 'Enter a campaign name before copying the brief.');
    form.elements.namedItem('title').focus();
    return;
  }
  const brief = formatBrief({ ...values, trackingUrl: byId('saved-campaign-link').value });
  try {
    await navigator.clipboard.writeText(brief);
    notify('Campaign brief copied.', draftNotice);
  } catch {
    const output = byId('brief-output');
    byId('brief-output-label').hidden = false;
    output.value = brief;
    output.focus();
    output.select();
    notify('Brief selected. Use your device’s Copy command.', draftNotice);
  }
});
byId('campaign-link').addEventListener('click', () => {
  withEditorClosed(() => {
    linkAssociation.value = editingId;
    applyLinkAssociation();
    location.hash = 'links';
  });
});
byId('duplicate-campaign').addEventListener('click', () => {
  const source = campaigns.find(({ id }) => id === editingId);
  if (!source) return;
  const variant = campaignVariant(source);
  const showVariant = () => {
    editingId = undefined;
    editingLaunch = variant.launchId;
    byId('dialog-heading').textContent = 'New channel variant';
    for (const id of ['delete-campaign', 'campaign-link', 'duplicate-campaign', 'saved-link-field', 'brief-output-label']) {
      byId(id).hidden = true;
    }
    byId('saved-campaign-link').value = '';
    resetMedia();
    byId('email-preview').open = false;
    for (const field of fields) form.elements.namedItem(field).value = variant[field] ?? '';
    updateChannelOptions();
    initialFields = [];
    displayMessage(campaignError);
    updateDraftContext();
    updateDraftButtons();
    notify('Choose a channel and add its draft.', draftNotice);
    form.elements.namedItem('channel').focus();
  };
  if (editFields().every((value, index) => value === initialFields[index])) showVariant();
  else confirmAction('Start a variant from the saved campaign?', 'Unsaved edits will be lost. The original campaign will not change.', 'Start variant', 'Keep editing', showVariant);
});
function updateDraftContext() {
  const { audience, objective } = formValues(form);
  const notes = [
    audience.trim() && `Audience: ${audience.trim()}`,
    objective.trim() && `Objective: ${objective.trim()}`,
  ].filter(Boolean);
  displayMessage(byId('draft-context'), notes.length ? `Writing notes (not copied): ${notes.join(' · ')}` : '');
}
form.addEventListener('input', (event) => {
  if (['audience', 'objective'].includes(event.target.name)) updateDraftContext();
  if (event.target.name === 'channel') {
    updateDraftButtons();
    if (editingId && isSocial(event.target.value) && !mediaFiles.length && !mediaPending) loadMedia();
  }
  if (['publishDate', 'publishTime'].includes(event.target.name)) {
    const zone = form.elements.namedItem('timeZone');
    if (form.elements.namedItem('publishDate').value && form.elements.namedItem('publishTime').value && !zone.value) zone.value = deviceZone;
  }
});
byId('email-preview').addEventListener('toggle', refreshEmailPreview);
byId('social-preview').addEventListener('toggle', renderMedia);
mediaInput.addEventListener('change', () => {
  const files = [...mediaInput.files];
  mediaInput.value = '';
  if (files.length) changeMedia([...mediaFiles, ...files]);
});
byId('insert-template').addEventListener('click', () => {
  const insert = () => {
    draft.value = copyTemplate(formValues(form));
    updateDraftButtons();
    draft.focus();
    draft.scrollTop = 0;
  };
  if (draft.value.trim()) confirmAction('Replace this draft?', 'Regenerating from the brief replaces your current channel copy.', 'Replace draft', 'Keep draft', insert);
  else insert();
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
  const missing = values.status === 'Ready' ? missingReadyFields(values) : [];
  if (missing.length) {
    const list = new Intl.ListFormat('en').format(missing.map((field) => readinessFields[field]));
    displayMessage(campaignError, `Fill in the ${list} before marking this campaign Ready.`);
    form.elements.namedItem(missing[0]).focus();
    return;
  }
  if (values.status === 'Ready' && exceedsCaptionLimit(values)) {
    displayMessage(campaignError, `Shorten the ${values.channel} caption to ${platformLimits[values.channel]} characters or fewer before marking it Ready.`);
    draft.focus();
    return;
  }
  const id = editingId ?? crypto.randomUUID();
  if (campaigns.some((row) => row.id !== id && launchKey(row) === editingLaunch && row.channel === values.channel)) {
    displayMessage(campaignError, 'This launch already has a draft for that channel.');
    return;
  }
  if (saveCampaigns((list) => {
    const previous = list.find((row) => row.id === id);
    if (editingId && !previous) throw new Error('Campaign no longer exists.');
    if (editingLaunch && !list.some((row) => launchKey(row) === editingLaunch)) throw new Error('Launch no longer exists.');
    const { trackingUrl } = previous ?? {};
    return saveCampaignChannel(list, { ...values, ...(trackingUrl ? { trackingUrl } : {}), id, launchId: editingLaunch || id, example: false });
  })) {
    if (!editingId) search.value = filter.value = '';
    refreshList();
    dialog.close();
    notify(editingId ? 'Campaign updated.' : editingLaunch ? 'Channel variant added.' : 'Campaign created.');
  }
});
byId('delete-campaign').addEventListener('click', () => {
  const hasOtherChannels = campaigns.some((row) => row.id !== editingId && launchKey(row) === editingLaunch);
  const title = hasOtherChannels ? 'Delete this channel variant?' : 'Delete this campaign?';
  const detail = hasOtherChannels ? 'Other channels and the shared brief will remain.' : 'The saved brief and draft will be removed.';
  confirmAction(title, `${detail} Saved links will remain in history.`, hasOtherChannels ? 'Delete variant' : 'Delete campaign', 'Keep editing', () => {
    if (saveCampaigns((list) => list.filter((row) => row.id !== editingId))) {
      updateMedia(editingId, []).catch(() => {});
      refreshList();
      dialog.close();
      notify(hasOtherChannels ? 'Channel variant deleted.' : 'Campaign deleted.');
    }
  });
});

function refreshCalendar() {
  const dates = weekDates(calendarDate, weekOffset);
  const posts = weeklySocialPosts(campaigns, dates);
  const asDate = (iso) => new Date(iso + 'T00:00:00Z');
  byId('week-heading').textContent = `${mediumDate.format(asDate(dates[0]))} – ${mediumDate.format(asDate(dates[6]))}`;
  byId('jump-week').value = dates[0];
  byId('export-week').disabled = !posts.length;
  const unscheduled = campaigns.filter((row) => !row.example && isSocial(row.channel) && !row.publishDate).length;
  byId('week-summary').textContent = `${posts.length} scheduled this week. ${unscheduled ? `${unscheduled} unscheduled in Campaigns.` : ''}`.trim();
  byId('calendar-week').replaceChildren(...dates.map((date) => {
    const day = makeNode('section', 'calendar-day');
    const items = makeNode('div', 'calendar-posts');
    for (const row of posts.filter((post) => post.publishDate === date)) {
      const button = makeNode('button', 'calendar-post');
      button.type = 'button';
      button.dataset.id = row.id;
      const details = document.createElement('span');
      details.append(makeNode('strong', '', row.title), makeNode('small', '', `${row.publishTime} ${row.timeZone} · ${row.channel}`));
      button.append(details, makeNode('span', `status ${row.status.toLowerCase().replace(' ', '-')}`, row.status));
      button.addEventListener('click', () => openEditor(row, button));
      items.append(button);
    }
    if (!items.children.length) items.append(makeNode('p', 'muted hint', 'No posts planned'));
    day.append(makeNode('h3', '', dayLabel.format(asDate(date))), items);
    return day;
  }));
}

byId('previous-week').addEventListener('click', () => { weekOffset--; refreshCalendar(); });
byId('current-week').addEventListener('click', () => { calendarDate = today(); weekOffset = 0; refreshCalendar(); });
byId('next-week').addEventListener('click', () => { weekOffset++; refreshCalendar(); });
byId('jump-week').addEventListener('change', (event) => {
  if (!event.target.value || !event.target.reportValidity()) return;
  calendarDate = event.target.value;
  weekOffset = 0;
  refreshCalendar();
});
byId('export-week').addEventListener('click', () => {
  const dates = weekDates(calendarDate, weekOffset);
  downloadFile(socialWeekCsv(weeklySocialPosts(campaigns, dates)), 'text/csv;charset=utf-8', `flow-social-week-${dates[0]}.csv`);
});

function clearLink() {
  displayMessage(linkError);
  displayMessage(trackingError);
  displayMessage(trackingNotice);
  linkOutput.value = '';
  copyLinkButton.disabled = true;
  saveLinkButton.disabled = true;
}

function showDestinationWarning() {
  displayMessage(destinationWarning);
  if (!destination.value.trim()) return;
  try {
    const message = isFlowDestination(destination.value)
      ? 'This matches the Flow domain in the app config. Check that the page is live before sharing.'
      : 'This is not the configured Flow HTTPS domain. Verify the destination before sharing.';
    displayMessage(destinationWarning, message);
  } catch {
    // The form reports invalid URLs on submit.
  }
}

function refreshLinkAssociations(work) {
  const selection = linkAssociation.value;
  const options = work.map((row) => new Option(`${row.title} · ${row.channel}`, row.id));
  linkAssociation.replaceChildren(new Option('No campaign — build a standalone link', ''), ...options);
  linkAssociation.value = work.some(({ id }) => id === selection) ? selection : '';
  if (selection !== linkAssociation.value) applyLinkAssociation();
}

function applyLinkAssociation() {
  const campaign = campaigns.find(({ id }) => id === linkAssociation.value);
  if (campaign) {
    const defaults = trackingDefaults(campaign);
    for (const [field, value] of Object.entries(defaults)) linkForm.elements.namedItem(field).value = value;
  } else {
    linkForm.reset();
  }
  destination.setCustomValidity('');
  clearLink();
  showDestinationWarning();
}

linkAssociation.addEventListener('change', applyLinkAssociation);
byId('use-flow-url').addEventListener('click', () => {
  destination.value = configuredFlowUrl + '/';
  destination.dispatchEvent(new Event('input', { bubbles: true }));
  destination.focus();
});
destination.addEventListener('input', () => {
  destination.setCustomValidity('');
  showDestinationWarning();
});
destination.addEventListener('invalid', () => {
  if (destination.validity.typeMismatch) destination.setCustomValidity('Enter a complete URL starting with https:// or http://.');
});
linkForm.addEventListener('input', clearLink);
linkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearLink();
  try {
    linkOutput.value = trackingLink(formValues(linkForm));
    copyLinkButton.disabled = false;
    saveLinkButton.disabled = false;
    saveLinkButton.textContent = linkAssociation.value ? 'Save to campaign' : 'Save link';
    linkOutput.focus({ preventScroll: true });
    byId('tracking-result').scrollIntoView({ block: 'nearest' });
  } catch (error) {
    displayMessage(linkError, error.message);
  }
});
copyLinkButton.addEventListener('click', () => copyText(linkOutput, 'Tracking link copied.'));
saveLinkButton.addEventListener('click', () => {
  const id = linkAssociation.value;
  const url = linkOutput.value;
  if (!url) return;
  const saved = saveWorkspace((workspace) => {
    const campaign = workspace.campaigns.find((row) => row.id === id);
    if (id && !campaign) throw new Error('Campaign no longer exists.');
    const record = { id: crypto.randomUUID(), url, campaignId: id, campaignTitle: campaign ? `${campaign.title} · ${campaign.channel}` : '', createdAt: new Date().toISOString() };
    return {
      campaigns: workspace.campaigns.map((row) => row.id === id ? { ...row, trackingUrl: url } : row),
      links: [record, ...workspace.links],
    };
  }, trackingError);
  if (saved) {
    saveLinkButton.disabled = true;
    searchLinks.value = '';
    refreshHistory();
    displayMessage(trackingError);
    displayMessage(trackingNotice, id ? 'Saved to this campaign and link history.' : 'Saved to link history.');
  }
});

function matchingLinks() {
  const query = searchLinks.value.trim().toLowerCase();
  const names = new Map(campaigns.filter((row) => !row.example).map((row) => [row.id, `${row.title} · ${row.channel}`]));
  return links.map((link) => ({ ...link, campaignTitle: names.get(link.campaignId) || link.campaignTitle }))
    .filter((link) => `${link.campaignTitle} ${link.url}`.toLowerCase().includes(query))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function refreshHistory() {
  const results = matchingLinks();
  const list = byId('history-list');
  const rows = results.map((record) => {
    const item = makeNode('article', 'history-item');
    const details = document.createElement('div');
    const output = document.createElement('input');
    output.readOnly = true;
    output.value = record.url;
    output.setAttribute('aria-label', 'Saved tracking URL');
    details.append(makeNode('strong', '', record.campaignTitle || 'Standalone link'),
      makeNode('small', '', new Date(record.createdAt).toLocaleString()), output);
    const button = makeNode('button', 'button secondary small', 'Copy link');
    button.type = 'button';
    button.addEventListener('click', () => copyText(output, 'Tracking link copied.'));
    item.append(details, button);
    return item;
  });
  list.replaceChildren(...rows);
  byId('history-summary').textContent = links.length ? `${results.length} of ${links.length} saved links` : 'No links saved yet.';
  exportLinks.disabled = !results.length;
}

function downloadFile(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const download = document.createElement('a');
  download.href = url;
  download.download = filename;
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

searchLinks.addEventListener('input', refreshHistory);
exportLinks.addEventListener('click', () => downloadFile(linkHistoryCsv(matchingLinks()), 'text/csv;charset=utf-8', 'flow-tracking-links.csv'));
const backupFile = byId('backup-file');
const backupStatus = byId('backup-status');
const backupError = byId('backup-error');
byId('export-backup').addEventListener('click', () => {
  displayMessage(backupError);
  try {
    downloadFile(createBackup(storedWorkspace()), 'application/json', 'flow-marketing-studio-backup.json');
    displayMessage(backupStatus, 'Backup downloaded.');
  } catch {
    displayMessage(backupStatus);
    displayMessage(backupError, 'Could not export the saved workspace.');
  }
});
byId('import-backup').addEventListener('click', () => backupFile.click());
backupFile.addEventListener('change', async () => {
  const file = backupFile.files[0];
  backupFile.value = '';
  if (!file) return;
  displayMessage(backupStatus);
  displayMessage(backupError);
  let raw;
  try {
    if (file.size > 5_000_000) throw new Error('Backup is too large.');
    raw = await file.text();
    importBackup(raw, { campaigns: [], links: [] });
  } catch {
    displayMessage(backupError, 'Use a valid Flow Marketing Studio backup under 5 MB. Nothing was imported.');
    return;
  }
  let result;
  if (saveWorkspace((workspace) => {
    result = importBackup(raw, workspace);
    return { campaigns: result.campaigns, links: result.links };
  }, backupError)) {
    search.value = filter.value = '';
    refreshList();
    displayMessage(backupStatus, `Imported ${result.added} campaigns and ${result.linksAdded} links. Skipped ${result.skipped} existing campaigns.`);
  }
});
window.addEventListener('hashchange', showPage);
window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) refreshFromStorage();
});
byId('time-zones').replaceChildren(...[...new Set(['UTC', deviceZone, ...(Intl.supportedValuesOf?.('timeZone') ?? [])])]
  .map((zone) => new Option(zone)));
showPage();
refreshFromStorage();
