export const platformLimits = Object.freeze({ X: 280, Instagram: 2200, LinkedIn: 3000, TikTok: 2200 });
export const channels = ['Email', 'Social', 'Landing page', ...Object.keys(platformLimits)];
export const isSocial = (channel) => channel === 'Social' || Object.hasOwn(platformLimits, channel);
export const scheduleFields = ['publishDate', 'publishTime', 'timeZone'];
const dayMs = 86400000;
const segmenter = new Intl.Segmenter();
export const statuses = ['Draft', 'In review', 'Ready'];
export const storageKey = 'flow-marketing-studio:v1';
export const configuredFlowUrl = 'https://flowapp.daily';
const utmFields = ['source', 'medium', 'campaign', 'content', 'term'];
const requiredTags = utmFields.slice(0, 3);
export const limits = Object.freeze({ title: 100, objective: 180, audience: 180, cta: 100, message: 400, draft: 64000 });
const briefFields = ['title', 'objective', 'audience', 'cta', 'message', 'destination'];
export const readinessFields = Object.freeze({ objective: 'objective', audience: 'audience', cta: 'call to action', message: 'key message', draft: 'channel draft' });

export function campaignFields(values) {
  const result = {};
  for (const [field, limit] of Object.entries(limits)) {
    const value = values[field] ?? '';
    if (typeof value !== 'string') throw new Error('Each campaign field must be text.');
    result[field] = value.trim();
    if (result[field].length > limit) {
      throw new Error(field === 'draft' ? `Shorten the draft to ${limit.toLocaleString('en')} characters or fewer before saving.` : 'One of the fields is too long.');
    }
  }
  if (!result.title) throw new Error('Enter a campaign name.');
  if (!channels.includes(values.channel) || !statuses.includes(values.status)) {
    throw new Error('Choose a valid channel and status.');
  }
  if (values.destination?.trim()) result.destination = webUrl(values.destination).href;
  if (isSocial(values.channel) && scheduleFields.some((field) => values[field])) {
    Object.assign(result, scheduleDetails(values));
  }
  return { ...result, channel: values.channel, status: values.status };
}

export function visibleCampaigns(campaigns, search, status) {
  const query = search.trim().toLowerCase();
  return campaigns.filter((row) => (
    (!status || row.status === status)
    && [...briefFields, 'channel', 'draft'].some((field) => row[field]?.toLowerCase().includes(query))
  ));
}

export function campaignCounts(campaigns) {
  const work = [...groupCampaigns(campaigns.filter((row) => !row.example)).values()];
  return {
    total: work.length,
    review: work.filter((rows) => rows.some((row) => row.status === 'In review')).length,
    ready: work.filter((rows) => rows.every((row) => row.status === 'Ready' && !missingReadyFields(row).length)).length,
  };
}

export function missingReadyFields(campaign) {
  return Object.keys(readinessFields).filter((field) => !campaign[field]?.trim());
}

export function captionLength(channel, value) {
  const text = value.trim().normalize('NFC');
  if (channel !== 'X') return text.length;
  const weight = (part) => {
    let total = 0;
    for (const { segment } of segmenter.segment(part)) {
      if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(segment)) {
        total += 2;
      } else {
        for (const char of segment) {
          const code = char.codePointAt(0);
          total += code <= 0x10ff || (code >= 0x2000 && code <= 0x200d)
            || (code >= 0x2010 && code <= 0x201f) || (code >= 0x2032 && code <= 0x2037) ? 1 : 2;
        }
      }
    }
    return total;
  };
  return text.split(/(https?:\/\/[^\s<>"'()]+[^\s<>"'().,!?:;]|https?:\/\/[^\s<>"'().,!?:;])/gi)
    .reduce((sum, part, index) => sum + (index % 2 ? 23 : weight(part)), 0);
}

export function exceedsCaptionLimit({ channel, draft }) {
  return Object.hasOwn(platformLimits, channel) && captionLength(channel, draft) > platformLimits[channel];
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !value.startsWith('20')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

function scheduleDetails({ publishDate, publishTime, timeZone }) {
  if (!validDate(publishDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(publishTime) || !timeZone?.trim()) {
    throw new Error('Set a date (2000–2099), time, and time zone, or clear all three to leave the post unscheduled.');
  }
  try {
    if (!/^[A-Z_]+(?:\/[A-Z0-9_+.-]+)*$/i.test(timeZone.trim())) throw new Error();
    const zone = new Intl.DateTimeFormat('en', { timeZone: timeZone.trim() }).resolvedOptions().timeZone;
    return { publishDate, publishTime, timeZone: zone };
  } catch {
    throw new Error('Use a time zone like Europe/London, America/New_York, or UTC.');
  }
}

export function weekDates(date, offset = 0) {
  if (!validDate(date)) throw new Error('Choose a valid week date.');
  const day = new Date(date + 'T00:00:00Z');
  const monday = +day + (offset * 7 - (day.getUTCDay() + 6) % 7) * dayMs;
  return Array.from({ length: 7 }, (_, index) => new Date(monday + index * dayMs).toISOString().slice(0, 10));
}

export function weeklySocialPosts(campaigns, dates) {
  return campaigns.filter((row) => !row.example && isSocial(row.channel) && dates.includes(row.publishDate))
    .sort((a, b) => (a.publishDate + a.publishTime).localeCompare(b.publishDate + b.publishTime) || a.title.localeCompare(b.title));
}

export function socialWeekCsv(posts) {
  const rows = posts.map((row) => [
    row.publishDate, row.publishTime, row.timeZone, row.channel, row.status, row.title,
    row.objective, row.audience, row.cta, row.message, row.draft, row.trackingUrl || row.destination,
  ]);
  return formatCsv(['Date', 'Time', 'Time zone', 'Platform', 'Status', 'Campaign', 'Objective', 'Audience', 'CTA', 'Key message', 'Caption', 'Link'], rows);
}

export const launchKey = (campaign) => campaign.launchId || campaign.id;

export function groupCampaigns(campaigns) {
  const groups = new Map();
  for (const campaign of campaigns) {
    const key = launchKey(campaign);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(campaign);
  }
  return groups;
}

function applyBrief(campaign, source) {
  const next = { ...campaign };
  for (const field of briefFields) {
    if (source[field] === undefined) delete next[field];
    else next[field] = source[field];
  }
  if (next.status === 'Ready' && missingReadyFields(next).length) next.status = 'In review';
  return next;
}

export function saveCampaignChannel(campaigns, current) {
  const key = launchKey(current);
  if (campaigns.some((row) => row.id !== current.id && launchKey(row) === key && row.channel === current.channel)) {
    throw new Error('This launch already has a draft for that channel.');
  }
  const update = campaigns.map((row) => row.id === current.id ? current : launchKey(row) === key ? applyBrief(row, current) : row);
  return update.some(({ id }) => id === current.id) ? update : [current, ...update];
}

export function readCampaigns(raw) {
  return readWorkspace(raw).campaigns;
}

export function readWorkspace(raw) {
  if (raw === null) return { campaigns: examples.map((campaign) => ({ ...campaign })), links: [] };
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return { campaigns: parseCampaigns(data), links: [] };
  if (data?.version !== 1) throw new Error('Unrecognized workspace format.');
  return { campaigns: parseCampaigns(data.campaigns), links: parseLinks(data.links) };
}

function parseCampaigns(records) {
  if (!Array.isArray(records)) throw new Error('Invalid campaign storage.');
  const ids = new Set();
  return records.map((record) => {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)) {
      throw new Error('Invalid campaign ID.');
    }
    ids.add(record.id);
    const campaign = campaignFields(record);
    if (campaign.status === 'Ready' && (missingReadyFields(campaign).length || exceedsCaptionLimit(campaign))) campaign.status = 'In review';
    const link = record.trackingUrl;
    const trackingUrl = link ? webUrl(link).href : '';
    if (record.launchId !== undefined && (typeof record.launchId !== 'string' || !record.launchId)) {
      throw new Error('Invalid launch ID.');
    }
    return {
      ...campaign, id: record.id, example: record.example === true,
      ...(trackingUrl ? { trackingUrl } : {}), ...(record.launchId ? { launchId: record.launchId } : {}),
    };
  });
}

function parseLinks(records) {
  if (!Array.isArray(records)) throw new Error('Invalid link history.');
  const ids = new Set();
  return records.map((record) => {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)
      || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))
      || typeof record.campaignId !== 'string' || typeof record.campaignTitle !== 'string') {
      throw new Error('Invalid saved link.');
    }
    ids.add(record.id);
    return {
      id: record.id, url: webUrl(record.url).href, createdAt: record.createdAt,
      campaignId: record.campaignId, campaignTitle: record.campaignTitle,
    };
  });
}

export function createBackup({ campaigns, links }) {
  return JSON.stringify({ version: 1, campaigns: campaigns.filter((row) => !row.example), links }, null, 2);
}

function mergeRecords(existing, incoming) {
  const ids = new Set(existing.map(({ id }) => id));
  return [...incoming.filter(({ id }) => !ids.has(id)), ...existing];
}

export function importBackup(raw, current) {
  const backup = JSON.parse(raw);
  if (backup?.version !== 1 || !Array.isArray(backup.campaigns)) throw new Error('Not a Flow Studio backup.');
  const incoming = parseCampaigns(backup.campaigns);
  if (incoming.some(({ example }) => example)) throw new Error('A backup cannot include examples.');
  const groups = groupCampaigns(current.campaigns);
  const ids = new Set(current.campaigns.map(({ id }) => id));
  const addedCampaigns = [];
  for (const row of incoming) {
    const key = launchKey(row);
    const siblings = groups.get(key) ?? [];
    if (ids.has(row.id) || siblings.some(({ channel }) => channel === row.channel)) continue;
    const campaign = siblings.length ? applyBrief(row, siblings[0]) : row;
    addedCampaigns.push(campaign);
    groups.set(key, [...siblings, campaign]);
  }
  const campaigns = [...addedCampaigns, ...current.campaigns];
  const links = mergeRecords(current.links, parseLinks(backup.links ?? []));
  const added = campaigns.length - current.campaigns.length;
  return { campaigns, links, added, skipped: incoming.length - added, linksAdded: links.length - current.links.length };
}

export function campaignVariant(campaign) {
  const variant = campaignFields(campaign);
  for (const field of scheduleFields) delete variant[field];
  return { ...variant, launchId: launchKey(campaign), status: 'Draft', draft: '' };
}

export function formatBrief({ title, channel, status, objective, audience, cta, message, destination, trackingUrl }) {
  return [
    title.trim(), `Channel: ${channel}`, `Status: ${status}`,
    `Objective: ${objective.trim() || 'Not set'}`, `Audience: ${audience.trim() || 'Not set'}`,
    `Call to action: ${cta.trim() || 'Not set'}`, `Key message: ${message.trim() || 'Not set'}`,
    ...(destination?.trim() ? [`Destination: ${destination.trim()}`] : []),
    ...(trackingUrl ? [`Tracking link: ${trackingUrl}`] : []),
  ].join('\n');
}

export function copyTemplate({ title, channel, message, cta }) {
  const name = title?.trim();
  const body = message?.trim() || 'Start with one thing that matters today. Flow brings priorities, habits, and spending together in one calm space.';
  const action = cta?.trim() || 'Try Flow';
  const socialCopy = `${body}\n\n${action}`;
  if (channel === 'X') return `${socialCopy} → [link]`;
  if (channel === 'Instagram') return `${socialCopy}\n\n[Add relevant hashtags]`;
  if (channel === 'LinkedIn') return `${name ? name + '\n\n' : ''}${socialCopy}\n\n[Invite a response or include a link]`;
  if (channel === 'TikTok') return `${socialCopy}\n\n[Add a topic or relevant hashtags]`;
  switch (channel) {
    case 'Email':
      return `From: Flow\nSubject: ${name || 'Make room for what matters'}\nPreview text: ${message?.trim() || 'A calmer way to plan your day.'}\n\nHi there,\n\n${body}\n\n${action}\n\n— Flow\n\n[Sender mailing address]\nUnsubscribe: [unsubscribe link]`;
    case 'Social':
      return `${name ? name + '\n\n' : ''}${body}\n\n${action} → [link]`;
    case 'Landing page':
      return `Headline: ${name || 'Life, but easier.'}\n\nSubhead: ${body}\n\nButton: ${action}\n\nFeatures\n- [Name a verified Flow feature and describe what it does.]\n- [Explain one benefit for this audience.]\n\nFAQ\nQ: [What might a visitor want to know?]\nA: [Answer with a verified fact.]\n\nOptional social proof: [Use an approved quote or omit this section.]\n\nSEO title: ${name || 'Life, but easier.'} | Flow\nMeta description: ${body}`;
    default:
      throw new Error('Choose a valid channel.');
  }
}

export function emailDraftPreview(draft) {
  const headers = {};
  const lines = draft.trim().split(/\r?\n/);
  while (lines.length) {
    const header = /^(from|subject|preview text):\s*(.*)$/i.exec(lines[0]);
    if (!header) break;
    headers[header[1].toLowerCase()] = header[2];
    lines.shift();
  }
  return { headers, body: lines.join('\n').trim() };
}

function webUrl(destination) {
  let url;
  try {
    const address = destination?.trim() || '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) throw new Error();
    url = new URL(address);
  } catch {
    throw new Error('Enter a complete destination URL, including https:// or http://.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS URL without sign-in credentials.');
  }
  return url;
}

export function isFlowDestination(address) {
  const { hostname, protocol } = webUrl(address);
  const flowHost = new URL(configuredFlowUrl).hostname;
  return protocol === 'https:' && (hostname === flowHost || hostname.endsWith(`.${flowHost}`));
}

function campaignSlug(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

export function trackingDefaults(campaign) {
  const saved = campaign.trackingUrl ? webUrl(campaign.trackingUrl) : null;
  const slug = campaignSlug(campaign.title);
  const media = { Email: 'email', 'Landing page': 'web' };
  return {
    destination: campaign.destination || saved?.href || '',
    source: saved?.searchParams.get('utm_source') || '',
    medium: saved?.searchParams.get('utm_medium') || (isSocial(campaign.channel) ? 'social' : media[campaign.channel]),
    campaign: saved?.searchParams.get('utm_campaign') || slug,
    content: saved?.searchParams.get('utm_content') || '',
    term: saved?.searchParams.get('utm_term') || '',
  };
}

export function trackingLink(values) {
  const url = webUrl(values.destination);
  const original = [...url.searchParams];
  for (const field of utmFields) {
    const key = `utm_${field}`;
    const matches = original.filter(([label]) => label.toLowerCase() === key);
    const input = values[field]?.trim();
    const required = requiredTags.includes(field);
    if (!input && required) throw new Error('Source, medium, and campaign are required.');
    const existing = matches.find(([, value]) => value.trim())?.[1];
    for (const [label] of matches) {
      if (label !== key) url.searchParams.delete(label);
    }
    const value = field === 'campaign' ? campaignSlug(input) : required ? input.toLowerCase() : input || existing;
    if (required && !value) throw new Error('Use at least one letter or number in the campaign tag.');
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url.href;
}

function formatCsv(header, rows) {
  const escapeCell = (value) => {
    const text = String(value ?? '');
    const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

export function linkHistoryCsv(links) {
  const rows = links.map(({ createdAt, campaignTitle, url }) => {
    const params = webUrl(url).searchParams;
    return [createdAt, campaignTitle, url, ...utmFields.map((key) => params.get(`utm_${key}`))];
  });
  return formatCsv(['Saved at', 'Campaign', 'URL', ...utmFields.map((key) => `utm_${key}`)], rows);
}

const examples = [
  {
    id: 'example-morning', example: true, title: 'The morning reset', channel: 'Email', status: 'In review',
    objective: 'Introduce the Morning Brief.', audience: 'People who want more direction at the start of the day',
    cta: 'Open your morning brief', message: 'Start your day with one clear priority, not a longer to-do list.',
    draft: 'Subject: A quieter way to start the day\nPreview text: One priority to give your day direction.\n\nHi there,\n\nStart your day with one clear priority, not a longer to-do list. Use the Morning Brief to see what’s ahead, then pick the one thing you want to make time for.\n\nOpen your morning brief\n\n— Flow',
  },
  {
    id: 'example-rituals', example: true, title: 'Small rituals, steady days', channel: 'Social', status: 'Draft',
    objective: 'Show how recurring rituals work.', audience: 'People building an evening routine',
    cta: 'Make a ritual in Flow', message: 'Give the small things you do every day a home.',
    draft: 'Give the small things you do every day a home. Set up an evening ritual in Flow and check off each step as you go.\n\nMake a ritual in Flow → [link]',
  },
  {
    id: 'example-positioning', example: true, title: 'Life, but easier', channel: 'Landing page', status: 'Ready',
    objective: 'Try a clearer description of Flow.', audience: 'People discovering Flow for the first time',
    cta: 'Try Flow', message: 'Plan your day, keep up with habits, and log what you spend in one calm space.',
    draft: 'Headline: Life, but easier.\n\nSubhead: Plan your day, keep up with habits, and log what you spend in one calm space.\n\nButton: Try Flow',
  },
];
