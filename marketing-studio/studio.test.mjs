import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campaignCounts, campaignFields, campaignVariant, captionLength, configuredFlowUrl, copyTemplate, createBackup,
  emailDraftPreview, exceedsCaptionLimit, formatBrief, importBackup, isFlowDestination, linkHistoryCsv, missingReadyFields,
  readCampaigns, readWorkspace, saveCampaignChannel, socialWeekCsv, trackingDefaults, trackingLink, visibleCampaigns,
  weekDates, weeklySocialPosts,
} from './studio.mjs';

const base = { title: 'Flow campaign', channel: 'Email', status: 'Draft' };
const tags = { destination: 'https://example.com/start', source: 'Flow weekly', medium: 'email', campaign: 'morning-reset' };

test('campaign fields trim whitespace but keep multiline copy', () => {
  assert.deepEqual(campaignFields({ ...base, title: '  My campaign ', draft: '  First line\nSecond line  ' }), {
    title: 'My campaign', objective: '', audience: '', cta: '', message: '', draft: 'First line\nSecond line',
    channel: 'Email', status: 'Draft',
  });
  assert.throws(() => campaignFields({ ...base, title: '   ' }), /campaign name/);
  assert.equal(campaignFields({ ...base, draft: 'x'.repeat(10200) }).draft.length, 10200);
  assert.throws(() => campaignFields({ ...base, draft: 'x'.repeat(64001) }), /Shorten the draft/);
  assert.throws(() => campaignFields({ ...base, status: 'Published' }), /valid channel and status/);
});

test('starts with labeled examples only on first visit, not after deleting the last campaign', () => {
  const examples = readCampaigns(null);
  assert.equal(examples.length, 3);
  assert.ok(examples.every((row) => row.example));
  examples[0].title = 'Changed example';
  assert.notEqual(readCampaigns(null)[0].title, examples[0].title);
  assert.deepEqual(readCampaigns('[]'), []);
});

test('saved records round-trip; malformed or duplicate storage is rejected', () => {
  const saved = [{ ...campaignFields({ ...base, draft: 'Draft copy' }), id: 'campaign-1', example: false }];
  assert.deepEqual(readCampaigns(JSON.stringify(saved)), saved);
  for (const raw of ['{', '{}', '[null]', JSON.stringify([...saved, ...saved])]) {
    assert.throws(() => readCampaigns(raw));
  }
});

test('case-insensitive search combines with status without changing overview counts', () => {
  const campaigns = readCampaigns(null);
  assert.deepEqual(visibleCampaigns(campaigns, ' EVENING ', 'Draft').map(({ id }) => id), ['example-rituals']);
  assert.deepEqual(visibleCampaigns(campaigns, 'evening', 'Ready'), []);
  assert.deepEqual(campaignCounts(campaigns), { total: 0, review: 0, ready: 0 });
  assert.equal(visibleCampaigns([{ ...base, message: 'Very specific claim' }], 'specific claim', '').length, 1);
  assert.equal(visibleCampaigns([{ ...base, draft: 'A rare phrase' }], 'rare phrase', '').length, 1);
});

test('each channel gets a tailored copy template using the brief', () => {
  const brief = { title: 'Morning kickoff', message: 'Show the Morning Brief.', cta: 'Open the app' };
  const email = copyTemplate({ ...brief, channel: 'Email' });
  assert.match(email, /^From: Flow\nSubject: Morning kickoff\nPreview text: Show the Morning Brief\./);
  assert.match(email, /Unsubscribe: \[unsubscribe link\]$/);
  const preview = emailDraftPreview(email);
  assert.deepEqual(preview.headers, { from: 'Flow', subject: 'Morning kickoff', 'preview text': 'Show the Morning Brief.' });
  assert.match(preview.body, /^Hi there,/);
  assert.equal(emailDraftPreview('<img>').body, '<img>');
  assert.match(copyTemplate({ ...brief, channel: 'Social' }), /^Morning kickoff\s+Show the Morning Brief\.\s+Open the app → \[link\]$/);
  const landing = copyTemplate({ ...brief, channel: 'Landing page' });
  assert.match(landing, /^Headline: Morning kickoff\s+Subhead: Show the Morning Brief\.\n\nButton: Open the app/);
  for (const section of ['Features', 'FAQ', 'SEO title', 'Meta description']) assert.ok(landing.includes(section), section);
  assert.match(copyTemplate({ channel: 'Email' }), /Try Flow/);
  assert.throws(() => copyTemplate({ channel: 'Invalid' }), /valid channel/);
});

test('UTM links retain unrelated parameters and fragments, replacing matching tags', () => {
  const url = new URL(trackingLink({
    ...tags,
    destination: 'https://example.com/start?lang=en&utm_source=old&UTM_SOURCE=duplicate&utm_term=&UtM_TeRm=first&utm_term=second#overview',
    content: 'hero & footer',
  }));
  assert.equal(url.hash, '#overview');
  assert.deepEqual([...url.searchParams], [
    ['lang', 'en'], ['utm_source', 'flow weekly'], ['utm_term', 'first'], ['utm_medium', 'email'],
    ['utm_campaign', 'morning-reset'], ['utm_content', 'hero & footer'],
  ]);
  const retained = new URL(trackingLink({
    ...tags, destination: 'https://example.com/?UTM_Content=old&utm_content=duplicate&UTM_TERM=old',
    medium: 'Email', campaign: 'Launch', content: ' ', term: 'Flow & friends',
  }));
  assert.deepEqual(Object.fromEntries(retained.searchParams), {
    utm_source: 'flow weekly', utm_medium: 'email', utm_campaign: 'launch', utm_content: 'old', utm_term: 'Flow & friends',
  });
  assert.deepEqual(retained.searchParams.getAll('utm_content'), ['old']);
  assert.equal(new URL(trackingLink({ ...tags, campaign: ' Brïef Launch! ' })).searchParams.get('utm_campaign'), 'brief-launch');
  assert.throws(() => trackingLink({ ...tags, campaign: '---' }), /letter or number/);
});

test('destination matches only HTTPS on the configured Flow domain or its subdomains', () => {
  const { hostname } = new URL(configuredFlowUrl);
  assert.equal(isFlowDestination(configuredFlowUrl), true);
  assert.equal(isFlowDestination(`https://launch.${hostname}/`), true);
  for (const destination of [`http://${hostname}`, `https://not-${hostname}`, `https://${hostname}.example.com`]) {
    assert.equal(isFlowDestination(destination), false);
  }
});

test('UTM builder rejects incomplete fields, relative URLs, non-web protocols, and credentials', () => {
  assert.throws(() => trackingLink({ ...tags, source: '  ' }), /required/);
  for (const destination of ['/relative', 'https:invalid', 'javascript:alert(1)', 'https://user:secret@example.com/']) {
    assert.throws(() => trackingLink({ ...tags, destination }));
  }
});

test('Ready requires a complete brief and channel draft, including for older saved campaigns', () => {
  const draft = { ...campaignFields(base), id: 'row', example: false };
  assert.deepEqual(missingReadyFields(draft), ['objective', 'audience', 'cta', 'message', 'draft']);
  const ready = { ...draft, id: 'complete', status: 'Ready', objective: 'Grow adoption', audience: 'Families', cta: 'Try Flow', message: 'Make time', draft: 'Email copy' };
  assert.deepEqual(missingReadyFields(ready), []);
  assert.deepEqual(campaignCounts([...readCampaigns(null), ready, draft]), { total: 2, review: 0, ready: 1 });
  const restored = readCampaigns(JSON.stringify([{ ...draft, status: 'Ready' }]));
  assert.equal(restored[0].status, 'In review');
});

test('brief copy contains strategy and tracking link but not the channel draft', () => {
  const brief = formatBrief({ ...campaignFields({ ...base, objective: 'Improve uptake', audience: 'Busy parents', message: 'A quieter day', cta: 'Try Flow', draft: 'Do not include' }),
    trackingUrl: 'https://example.com/start' });
  for (const text of ['Flow campaign', 'Email', 'Draft', 'Improve uptake', 'Busy parents', 'A quieter day', 'Try Flow', 'https://example.com/start']) {
    assert.ok(brief.includes(text), text);
  }
  assert.ok(!brief.includes('Do not include'));
});

test('tracking fields prefill from a campaign, preferring its saved URL where present', () => {
  assert.deepEqual(trackingDefaults({ title: '  Café ✨ & 家庭  ', channel: 'Email' }), {
    destination: '', source: '', medium: 'email', campaign: 'cafe-家庭', content: '', term: '',
  });
  const trackingUrl = trackingLink({ ...tags, content: 'footer', term: 'daily routine' });
  assert.deepEqual(trackingDefaults({ title: 'New title', channel: 'Social', trackingUrl }), {
    destination: trackingUrl, source: 'flow weekly', medium: 'email', campaign: 'morning-reset', content: 'footer', term: 'daily routine',
  });
});

test('workspace and backup round-trip real campaigns and links without overwriting duplicate IDs', () => {
  const examples = readCampaigns(null);
  const row = { ...campaignFields(base), id: 'backup-1', example: false, trackingUrl: trackingLink(tags) };
  const link = { id: 'link-1', url: row.trackingUrl, createdAt: '2026-11-19T12:00:00.000Z', campaignId: row.id, campaignTitle: row.title };
  const workspace = { campaigns: [...examples, row], links: [link] };
  const backup = createBackup(workspace);
  const empty = { campaigns: [], links: [] };
  assert.deepEqual(readWorkspace(JSON.stringify({ version: 1, ...workspace })), workspace);
  assert.deepEqual(readWorkspace(JSON.stringify([row])), { campaigns: [row], links: [] });
  assert.deepEqual(importBackup(backup, { ...empty, campaigns: examples }), {
    campaigns: [row, ...examples], links: [link], added: 1, skipped: 0, linksAdded: 1,
  });
  const changed = { ...row, title: 'Changed here' };
  assert.deepEqual(importBackup(backup, { campaigns: [changed], links: [link] }), {
    campaigns: [changed], links: [link], added: 0, skipped: 1, linksAdded: 0,
  });
  assert.deepEqual(importBackup('{"version":1,"campaigns":[]}', empty), { ...empty, added: 0, skipped: 0, linksAdded: 0 });
  assert.throws(() => importBackup('{"version":2,"campaigns":[]}', empty), /Not a Flow Studio backup/);
  assert.throws(() => importBackup(createBackup({ ...empty, links: [{ ...link, url: 'javascript:alert(1)' }] }), empty));
  assert.throws(() => importBackup(createBackup({ ...empty, campaigns: [row, row] }), empty), /Invalid campaign ID/);
});

test('variants share the brief but keep their own copy, schedule, status, and links', () => {
  const source = { ...campaignFields({ ...base, objective: 'Grow signups', draft: 'Email body' }), id: 'origin', trackingUrl: trackingLink(tags) };
  const variant = { ...campaignVariant(source), id: 'variant', channel: 'Landing page' };
  assert.equal(variant.title, source.title);
  assert.equal(variant.objective, source.objective);
  assert.equal(variant.status, 'Draft');
  assert.equal(variant.draft, '');
  assert.equal(variant.trackingUrl, undefined);
  const grouped = saveCampaignChannel([source], { ...variant, objective: 'Build awareness', draft: 'Landing copy' });
  const original = grouped.find(({ id }) => id === source.id);
  assert.equal(original.objective, 'Build awareness');
  assert.equal(original.draft, source.draft);
  assert.equal(original.trackingUrl, source.trackingUrl);
  assert.equal(campaignCounts(grouped).total, 1);
  assert.throws(() => saveCampaignChannel(grouped, { ...variant, channel: source.channel }), /already has a draft/);
  assert.deepEqual(readWorkspace(JSON.stringify({ version: 1, campaigns: grouped, links: [] })).campaigns.map(({ objective }) => objective), ['Build awareness', 'Build awareness']);
});

test('social schedules require date, local time, and a valid IANA time zone', () => {
  const scheduled = { ...base, channel: 'LinkedIn', publishDate: '2026-11-29', publishTime: '16:00', timeZone: 'Europe/London' };
  assert.equal(campaignFields(scheduled).timeZone, 'Europe/London');
  assert.throws(() => campaignFields({ ...scheduled, publishDate: '2026-02-30' }), /Set a date/);
  assert.throws(() => campaignFields({ ...scheduled, timeZone: 'Europe/Fiction' }), /Use a time zone/);
  assert.throws(() => campaignFields({ ...scheduled, publishTime: '' }), /Set a date/);
  assert.equal(campaignVariant({ ...scheduled, id: 'social' }).publishDate, undefined);
});

test('weekly CSV includes only this Monday–Sunday, sorted by local date and time', () => {
  const dates = weekDates('2026-11-29');
  assert.equal(dates[0], '2026-11-23');
  assert.equal(dates[6], '2026-11-29');
  assert.equal(weekDates('2026-11-29', 1)[0], '2026-11-30');
  assert.equal(weekDates('2027-01-01')[0], '2026-12-28');
  const post = { ...base, channel: 'TikTok', publishDate: dates[6], publishTime: '16:00', timeZone: 'UTC', message: 'Week recap', draft: 'Caption' };
  const posts = weeklySocialPosts([post, { ...post, publishDate: dates[0], publishTime: '15:00' },
    { ...post, publishDate: dates[0], publishTime: '09:00' }, { ...post, publishDate: '2026-11-30' }], dates);
  assert.deepEqual(posts.map(({ publishTime }) => publishTime), ['09:00', '15:00', '16:00']);
  assert.match(socialWeekCsv(posts), /"2026-11-23","09:00","UTC","TikTok","Draft","Flow campaign".*"Week recap","Caption"/);
});

test('social caption limits distinguish platforms and X weighted text', () => {
  assert.equal(captionLength('X', '中文 👩🏽‍💻 https://flowapp.daily/example'), 31);
  assert.equal(exceedsCaptionLimit({ channel: 'X', draft: 'a'.repeat(280) }), false);
  assert.equal(exceedsCaptionLimit({ channel: 'X', draft: 'a'.repeat(427) }), true);
  assert.equal(exceedsCaptionLimit({ channel: 'Instagram', draft: 'a'.repeat(2201) }), true);
  assert.equal(exceedsCaptionLimit({ channel: 'TikTok', draft: 'a'.repeat(2201) }), true);
  assert.equal(exceedsCaptionLimit({ channel: 'LinkedIn', draft: 'a'.repeat(2201) }), false);
  assert.equal(exceedsCaptionLimit({ channel: 'LinkedIn', draft: 'a'.repeat(3001) }), true);
});

test('CSV quotes separators and escapes formula-like cells', () => {
  const csv = linkHistoryCsv([{
    createdAt: '2026-11-19T12:00:00.000Z', campaignTitle: '=Launch, "Fall"', url: trackingLink({ ...tags, term: '@test' }),
  }]);
  assert.match(csv, /"utm_term"\r\n/);
  assert.ok(csv.includes(`"'=Launch, ""Fall"""`));
  assert.ok(csv.endsWith(`,"'@test"\r\n`));
});
