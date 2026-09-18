# Lens Log

Lens Log is an offline-first field notebook for architectural photographers working with technical cameras and shift lenses.

## The problem it solves

A technical camera gives you precise control over perspective, but it usually cannot tell the digital back what happened to the lens. The horizontal and vertical shift, the selected aperture and often even the lens itself are missing from the image metadata.

Those values are needed later in software such as Capture One. Writing them into a notebook or a generic form after every composition is slow, and matching handwritten notes to files at the end of a long shoot is unnecessarily fragile.

Lens Log turns that job into one compact gesture-based interface:

1. Set the four-digit frame number shown by the camera.
2. Choose the lens and aperture.
3. Enter horizontal and vertical shift.
4. Press **Save**.

The record is written to the device immediately. Network access is not required, so the app continues working underground, inside large buildings or anywhere else with unreliable reception. When the server becomes reachable again, locally stored records are synchronised.

## Designed for the way a technical camera is used

One composition can produce several images without changing the lens movements. Lens Log therefore records the first frame of each composition. In the continuous log and CSV export, the next composition can be used to infer which frames belong to the previous one.

The interface is deliberately direct and usable with one hand:

- Four-digit frame number with touch scrubbing or direct keyboard entry
- X and Y shift from −20 to +20 mm in 0.25 mm increments
- Horizontal gestures for X and vertical gestures for Y
- Arrow controls for precise single-step adjustments
- Lens and full-stop aperture selectors
- A Shift Zero control for returning both axes to zero
- Responsive portrait and landscape layouts for phones
- Automatic dark mode following the device, with a black-and-red low-light palette
- Persistent Compact/Large typography and optional CAD-style red-X/green-Y axis colouring
- A brief visual confirmation after every successful local save

The frame number does not advance automatically after saving. This keeps the displayed number identical to the record that was just stored; the photographer decides when to move to the next frame.

## Features

### Lens and shift configuration

- Built-in library covering technical-camera, tilt/shift and medium-format lenses from Canon, Fujifilm, Contax 645, Hasselblad H, ALPA, Rodenstock, Schneider-Kreuznach, Mamiya and Phase One
- Searchable lens library
- Show or hide only the lenses carried for a particular shoot
- Add and delete custom lenses with their own aperture sets
- Lens lists are ordered automatically by focal length
- IMAGE, ALPA and PICO shift conventions for translating camera movements into Capture One values
- Direction labels and gestures change with the selected convention
- The currently selected lens, aperture and shift convention synchronise between devices

Lens and manufacturer names are used descriptively and remain trademarks of their respective owners.

### Continuous log

- Every entry includes frame number, lens, aperture, X/Y shift and timestamp
- Multiple records may use the same frame number; their unique identifiers and timestamps keep them distinct when a camera counter wraps from `9999` to `0000`
- Search by four-digit frame number
- Edit a previous composition
- Confirmation before deleting an individual entry
- Two confirmations before clearing the complete log
- CSV export for later reference and manual entry in Capture One
- Full JSON backup and restore, including entries, lenses and shared current settings

### Offline-first data safety

Saving does not depend on the server:

```text
Save
→ validate the values
→ write the entry to IndexedDB
→ add or replace its durable pending mutation
→ wait for the local transaction to complete
→ update the interface
→ attempt server synchronisation
```

If the server is unavailable, the entry and its pending mutation remain stored locally. A later synchronisation sends only queued changes, in bounded batches, to the server-side SQLite database. Successful acknowledgement removes the mutation from the queue but never removes the local record.

The server assigns every accepted change a monotonically increasing revision. Each device requests only revisions it has not seen yet, avoiding full-database uploads and making ordering independent of differences between device clocks. Entries, lenses and current settings all use the same revisioned protocol. If a device detects that the server database has been replaced, it safely queues its local records to seed the new server instead of silently treating them as already synchronised.

The current lens, aperture and shift convention use the same offline-first path. A change is stored on the device immediately and the most recently updated selection is applied to other devices when they synchronise. Frame number and X/Y movement values remain device-local until a composition is saved.

The service worker caches only the application shell and static assets. API responses are never cached. Application updates use explicit versioned caches, clean up older Lens Log caches and do not clear or recreate IndexedDB.

When a new frontend is ready, Lens Log displays an **Update available** message. The user can save the current values before choosing **Reload update**, avoiding an unexpected refresh in the middle of a composition.

## Install as a phone app

Lens Log is a Progressive Web App. It does not require an App Store release or an Apple developer account.

On iPhone:

1. Open Lens Log in Safari over HTTPS.
2. Tap **Share**.
3. Choose **Add to Home Screen**.

After the first complete load, the installed app can open and save records without a connection. HTTPS is required for service workers on normal network addresses; `localhost` is the browser exception used for development.

## Run with Docker

Lens Log uses port `6464` and stores its server database in `/data`. The image is suitable for Unraid, Synology, TrueNAS and conventional Docker hosts on AMD64 or ARM64.

### Docker Compose

The included [`compose.yaml`](compose.yaml) contains an Unraid-oriented example:

```sh
docker compose up -d --build
```

Equivalent settings are:

| Setting | Value |
| --- | --- |
| Container port | `6464` |
| Host port | `6464` |
| Persistent container path | `/data` |
| Example Unraid host path | `/mnt/user/appdata/lens-log` |
| Restart policy | `unless-stopped` |

The SQLite database is stored as `/data/lens-log.sqlite`. Lens Log uses SQLite's online backup API to create a consistent snapshot at server startup and once every 24 hours. The latest 14 daily snapshots are retained in:

```text
/data/backups/lens-log-YYYY-MM-DD.sqlite
```

Because `/data` is the mounted persistent directory, these snapshots survive container replacement. Back up the complete mounted host directory with the rest of the server's application data. The browser's IndexedDB is a second local copy, but it should not be treated as a replacement for a server backup.

The Log panel also provides **Export full backup** and **Restore backup**. This portable JSON format includes entries, deletion markers, the complete lens library and shared current settings. Restoring replaces the local device copy, rebuilds its pending mutation queue and then merges the restored records through normal synchronisation.

### Unraid Docker icon

The Unraid icon reuses the same square LL artwork as the website and installed PWA. Its stable locations are:

- Repository asset: [`public/unraid-icon.png`](public/unraid-icon.png)
- Running application: `/unraid-icon.png`
- Container filesystem: `/app/dist/unraid-icon.png`

Unraid normally gets a container icon from its Docker template. An OCI image label does not automatically configure the icon shown by the Unraid interface.

Open the Lens Log container's settings in Unraid, enable **Advanced View**, and enter a directly accessible PNG URL in the **Icon URL** field. When the Lens Log server is reachable from the browser displaying the Unraid interface, use:

```text
https://YOUR-LENS-LOG-HOST/unraid-icon.png
```

For a LAN-only installation without HTTPS, this can instead be:

```text
http://YOUR-UNRAID-IP:6464/unraid-icon.png
```

If the repository is public, a raw GitHub URL is usually the most reliable choice because the icon remains available while the Lens Log container is stopped:

```text
https://raw.githubusercontent.com/OWNER/REPOSITORY/main/public/unraid-icon.png
```

The corresponding entry in an Unraid XML template is:

```xml
<Icon>https://raw.githubusercontent.com/OWNER/REPOSITORY/main/public/unraid-icon.png</Icon>
```

Replace `OWNER/REPOSITORY` with the actual GitHub repository path. After changing the icon URL, press **Apply**. If Unraid continues showing an older icon, refresh the Docker page or clear the browser's cached image.

### Private HTTPS access with Tailscale

One option is to bind Lens Log to localhost and expose it privately through Tailscale Serve:

```sh
tailscale serve --bg 6464
```

Open the resulting `https://…ts.net` address on the phone. Other HTTPS reverse proxies work as well.

### Load a prebuilt archive

Download the archive for the server architecture from the corresponding GitHub
Release. Generated Docker archives are release artefacts and are deliberately not
stored in the Git repository.

```sh
gunzip -c lens-log-<version>-amd64.tar.gz | docker load
```

Use the ARM64 archive instead for an ARM server.

## Updating Lens Log

The visible application version and service-worker cache version come from the `version` field in [`package.json`](package.json). Before creating a release, update that field—for example from `1.0.0` to `1.0.1`—and build a new image.

Replacing the container does not replace the SQLite database, its revision history or automatic snapshots as long as `/data` remains mounted. On the next update check, installed PWAs download the new worker and offer a controlled reload. Existing local entries and pending mutations remain in IndexedDB.

The running version is shown at the bottom of **Info → About Lens Log**.

## Local development

Node.js 22.13 or newer and pnpm are required.

```sh
pnpm install
pnpm run dev
```

For a production-style local run:

```sh
pnpm run build
DATA_DIR=./data pnpm start
```

Open `http://localhost:6464`.

Run the regression tests with:

```sh
pnpm test
```

## About

Lens Log was developed by Florian Amoser out of personal necessity, with the help of artificial intelligence. You can find his photographic work at [florianamoser.xyz](https://florianamoser.xyz/).

Found a bug, have an idea, or simply want to share how Lens Log works for you? Write to [lenslog@florianamoser.xyz](mailto:lenslog@florianamoser.xyz). Photographs showing where the app is used in the field are especially welcome.

Lens Log is open-source software released under the [MIT License](LICENSE). Typography uses Geist Sans and Geist Mono under the SIL Open Font License 1.1; further copyright and licence information is available in the [third-party notices](public/THIRD_PARTY_LICENSES.txt).

The software is provided as is, without warranty. Verify important records independently and use it at your own risk.
