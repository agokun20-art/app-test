# Flow Marketing Studio

A standalone internal workspace for planning Flow campaigns. It does not change the Expo app, connect to the Flow backend, or send or publish content.

## Run locally

From the repository root, run:

```sh
python3 -m http.server --bind 127.0.0.1 --directory marketing-studio 4173
```

Open <http://localhost:4173> in a modern browser. No packages, keys, or backend setup are needed.

## Try it

1. Open a labeled example or create a campaign. Set its channel and fill in the brief.
2. Copy the brief, insert a channel template, or regenerate copy after confirmation. Use **Create variant** for a shared launch brief with separate drafts, statuses, and links for each channel. Complete the brief and draft before marking each channel **Ready**.
3. Open **Link builder** to tag a verified destination. The Flow domain comes from the Expo app config; the studio does not check whether a destination is live. Generate a link, then save it to history with or without a campaign. Search history and export the matching rows to CSV.
4. Plan posts for X, Instagram, LinkedIn, or TikTok with a date, time, and time zone. The calendar sorts by each post’s local scheduled time and exports the visible Monday–Sunday as CSV. Caption counters are planning checks, not a guarantee that a platform will accept a post.
5. After saving a social draft, attach images or video and preview its caption and media. Attachment changes save immediately to this browser; they are excluded from backups and CSV exports.

Campaigns and saved links stay in this browser profile on this site only. Export a workspace backup before clearing browser data or switching browsers. Imports add campaigns and links without replacing existing records. Example drafts are illustrative and have not been published. If hosting beyond a local machine, use an authenticated internal host over HTTPS. Do not use the local Python server as a public production host.

Run the model tests with Node.js 22 or newer:

```sh
node --test marketing-studio/studio.test.mjs
```
