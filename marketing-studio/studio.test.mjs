import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaignCounts, campaignFields, copyTemplate, readCampaigns, trackingLink, visibleCampaigns } from './studio.mjs';

const base = { title: 'Flow campaign', channel: 'Email', status: 'Draft' };
const tags = { destination: 'https://example.com/start', source: 'Flow weekly', medium: 'email', campaign: 'morning-reset' };

test('campaign fields trim whitespace but keep multiline copy', () => {
  assert.deepEqual(campaignFields({ ...base, title: '  My campaign ', draft: '  First line\nSecond line  ' }), {
    title: 'My campaign', objective: '', audience: '', cta: '', message: '', draft: 'First line\nSecond line',
    channel: 'Email', status: 'Draft',
  });
  assert.throws(() => campaignFields({ ...base, title: '   ' }), /campaign name/);
  assert.throws(() => campaignFields({ ...base, draft: 'x'.repeat(8001) }), /too long/);
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
  assert.deepEqual(campaignCounts(campaigns), { total: 3, review: 1, ready: 1 });
});

test('each channel gets a tailored copy template using the brief', () => {
  const brief = { message: 'Show the Morning Brief.', cta: 'Open the app' };
  assert.match(copyTemplate({ ...brief, channel: 'Email' }), /Subject:.*\nPreview text:/);
  assert.match(copyTemplate({ ...brief, channel: 'Social' }), /^Show the Morning Brief\.\s+Open the app → \[link\]$/);
  assert.match(copyTemplate({ ...brief, channel: 'Landing page' }), /Subhead: Show the Morning Brief\.\n\nButton: Open the app$/);
  assert.match(copyTemplate({ channel: 'Email' }), /Try Flow/);
  assert.throws(() => copyTemplate({ channel: 'Invalid' }), /valid channel/);
});

test('UTM links retain unrelated parameters and fragments, replacing matching tags', () => {
  const url = new URL(trackingLink({
    ...tags,
    destination: 'https://example.com/start?lang=en&utm_source=old&utm_source=duplicate#overview',
    content: 'hero & footer',
  }));
  assert.equal(url.hash, '#overview');
  assert.deepEqual([...url.searchParams], [
    ['lang', 'en'], ['utm_source', 'Flow weekly'], ['utm_medium', 'email'],
    ['utm_campaign', 'morning-reset'], ['utm_content', 'hero & footer'],
  ]);
  const withoutContent = new URL(trackingLink({ ...tags, destination: 'https://example.com/?utm_content=old' }));
  assert.equal(withoutContent.searchParams.has('utm_content'), false);
});

test('UTM builder rejects incomplete fields, relative URLs, non-web protocols, and credentials', () => {
  assert.throws(() => trackingLink({ ...tags, source: '  ' }), /required/);
  for (const destination of ['/relative', 'https:invalid', 'javascript:alert(1)', 'https://user:secret@example.com/']) {
    assert.throws(() => trackingLink({ ...tags, destination }));
  }
});
