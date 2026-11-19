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
2. Insert a starter template into the empty draft, edit it, and save. Mark the campaign **In review** or **Ready** as it progresses. Copy the draft when you want to share it manually.
3. Open **Link builder** to add tracking tags to a destination. Enter the source, medium, and campaign, then generate and copy the URL.

Campaigns are saved in this browser profile on this site only. They do not sync or have a backup; private browsing or clearing site data can remove them. Example drafts are illustrative and have not been published. If hosting beyond a local machine, use an authenticated internal host over HTTPS. Do not use the local Python server as a public production host.

Run the model tests with Node.js 22 or newer:

```sh
node --test marketing-studio/studio.test.mjs
```
