export const channels = ['Email', 'Social', 'Landing page'];
export const statuses = ['Draft', 'In review', 'Ready'];
export const storageKey = 'flow-marketing-studio:v1';
export const limits = Object.freeze({ title: 100, objective: 180, audience: 180, cta: 100, message: 400, draft: 8000 });

export function campaignFields(values) {
  const result = {};
  for (const [field, limit] of Object.entries(limits)) {
    result[field] = String(values[field] ?? '').trim();
    if (result[field].length > limit) throw new Error('One of the fields is too long.');
  }
  if (!result.title) throw new Error('Enter a campaign name.');
  if (!channels.includes(values.channel) || !statuses.includes(values.status)) {
    throw new Error('Choose a valid channel and status.');
  }
  return { ...result, channel: values.channel, status: values.status };
}

export function visibleCampaigns(campaigns, search, status) {
  const query = search.trim().toLowerCase();
  return campaigns.filter((row) => (
    (!status || row.status === status)
    && [row.title, row.channel, row.audience, row.objective].some((field) => field.toLowerCase().includes(query))
  ));
}

export function campaignCounts(campaigns) {
  return {
    total: campaigns.length,
    review: campaigns.filter((row) => row.status === 'In review').length,
    ready: campaigns.filter((row) => row.status === 'Ready').length,
  };
}

export function readCampaigns(raw) {
  if (raw === null) return examples.map((campaign) => ({ ...campaign }));
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error('Invalid campaign storage.');
  const ids = new Set();
  return records.map((record) => {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)) {
      throw new Error('Invalid campaign ID.');
    }
    ids.add(record.id);
    return { ...campaignFields(record), id: record.id, example: record.example === true };
  });
}

export function copyTemplate({ channel, message, cta }) {
  const body = message?.trim() || 'Start with one thing that matters today. Flow brings priorities, habits, and spending together in one calm space.';
  const action = cta?.trim() || 'Try Flow';
  switch (channel) {
    case 'Email':
      return `Subject: Make room for what matters\nPreview text: A calmer way to plan your day.\n\nHi there,\n\n${body}\n\n${action}\n\n— Flow`;
    case 'Social':
      return `${body}\n\n${action} → [link]`;
    case 'Landing page':
      return `Headline: Life, but easier.\n\nSubhead: ${body}\n\nButton: ${action}`;
    default:
      throw new Error('Choose a valid channel.');
  }
}

export function trackingLink({ destination, source, medium, campaign, content }) {
  let url;
  try {
    const address = destination?.trim() || '';
    if (!/^\w+:\/\//.test(address)) throw new Error();
    url = new URL(address);
  } catch {
    throw new Error('Enter a complete destination URL, including https:// or http://.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS URL without sign-in credentials.');
  }
  for (const [key, input] of Object.entries({ source, medium, campaign, content })) {
    const value = input?.trim();
    if (value) url.searchParams.set(`utm_${key}`, value);
    else if (key === 'content') url.searchParams.delete('utm_content');
    else throw new Error('Source, medium, and campaign are required.');
  }
  return url.href;
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
