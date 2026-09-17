# Komari Web UI — Aspeternity Maintained Fork

This repository is the maintained frontend used by `Aspeternity/komari`.

> This is an independent maintenance fork of `komari-monitor/komari-web`. It is not an official continuation endorsed by the original authors.

## Branch model

```text
radix
  └─ development, fixes, UI work and CI validation

stable
  └─ production frontend consumed by Aspeternity/komari
```

Production Komari images always build from `Aspeternity/komari-web:stable`. Changes made on `radix` do not affect production until they are deliberately promoted to `stable`.

## Build validation

Both maintained branches are validated with:

```bash
npm ci
npm run build
```

Using `npm ci` keeps dependency installs reproducible from `package-lock.json`.

## Development environment

### Requirements

Node.js 22 or newer is recommended.

### Install dependencies

```bash
npm ci
```

### Configure the API target

1. Copy `.env.example` to `.env.development`.
2. Set `VITE_API_TARGET` in `.env.development` to your Komari development server.

### Start the development server

```bash
npm run dev
```

### Build

```bash
npm run build
```

The production output is generated in `dist/`.

## Theme development

This frontend can also be packaged as a Komari theme.

1. Complete the development setup above.
2. Adjust `komari-theme.json` as needed.
3. Build the frontend:

   ```bash
   npm run build
   ```

4. Package `dist/` together with `komari-theme.json` and the preview asset.
5. Upload the ZIP from Komari's theme management page.

`configuration` in `komari-theme.json` reuses the `data` field according to its type:

- `managed`: `data` is an array of configuration entries used to render the settings form.
- `raw`: `data` is raw HTML rendered in the main content area.
- `redirect`: `data` is a site-relative route resolved against the deployed `VITE_BASE_URL`.

## Production integration

The backend repository clones this repository's `stable` branch during CI, builds it, and embeds the result into the Komari binary. The production Docker image is published as:

```text
ghcr.io/aspeternity/komari
```

## Upstream

Original frontend: `komari-monitor/komari-web`

Original backend: `komari-monitor/komari`

Original copyright and license terms remain applicable to upstream code.