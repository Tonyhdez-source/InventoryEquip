# MedTrack — Medical Inventory System

A modern, dark-mode web application for tracking medical machines and equipment across multiple office locations. Built as a single-page app with **zero dependencies** — runs entirely in the browser using `localStorage` for persistence.

![Dark mode](https://img.shields.io/badge/Theme-Dark%20Mode-00d9c0?style=flat-square)
![No backend](https://img.shields.io/badge/Backend-None-success?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/Stack-Vanilla%20JS-yellow?style=flat-square)
![Responsive](https://img.shields.io/badge/Responsive-Yes-blue?style=flat-square)

---

## 📋 Project Overview

MedTrack helps healthcare facilities maintain an organized inventory of medical equipment across one or more office locations. Each machine record captures its serial number, model, manufacturer, assigned office, descriptive notes, and the date it was added. The interface emphasizes speed of entry, clear data visibility, and easy migration of data via CSV/JSON.

The entire app is contained in four files and can be opened directly from the file system — no build step, no server, no Node.js required.

---

## ✨ Features

### 🔐 Security
- **Passcode-protected login screen** (default: `1234`)
- Passcode can be changed in **Settings**
- Passcode is stored locally and never transmitted
- "Lock" button in the sidebar returns to the login screen at any time

### 📦 Inventory Management
- Add, edit, and delete medical machines
- Each entry tracks **Serial Number, Model, Maker, Office Location, Notes, Date Added**
- **Real-time search** across serial, model, maker, office, and notes
- **Sort** by date, model, maker, or serial number (asc/desc)
- **Filter** all views by office location
- Duplicate serial number protection

### 🏢 Multi-Office Support
- Create unlimited offices, each with name and optional address
- Office selection dropdown in the top bar filters every view
- Per-office inventory counts on the dashboard
- Deleting an office cascades to remove its assigned machines (with confirmation)

### 📊 Dashboard
- **Summary cards**: Total Machines, Offices, Added This Week, Unique Makers
- **Recently Added** list (last 6 machines)
- **Inventory by Office** bar chart showing distribution

### 💾 Data Management
- **Export to CSV** — open in Excel, Google Sheets, Numbers, etc.
- **Import from CSV** — bulk-load existing inventory; unknown offices are auto-created
- **JSON backup** — full snapshot of offices + inventory
- **JSON restore** — replace current data with a backup file
- **Wipe all data** — full reset with confirmation

### 🎨 UI / UX
- Dark-mode design with a teal medical accent color
- Responsive layout — desktop table view, mobile card view
- Sidebar navigation with mobile slide-out drawer
- Modal forms for add/edit operations
- Toast notifications for success / warning / error
- Empty-state messages when there's no data yet
- Loading animation on startup
- Smooth CSS animations throughout
- Keyboard shortcut: press **`/`** to focus search
- Respects `prefers-reduced-motion`

---

## 🚀 Installation

### Option 1: Run locally
1. **Download** or clone this repository.
2. **Open `index.html`** in any modern browser (Chrome, Firefox, Safari, Edge).
3. **Enter the default passcode `1234`** to access the app.

That's it. No installation, no dependencies, no build step.

### Option 2: Host on GitHub Pages
After uploading the repo to GitHub (instructions below):
1. Go to **Settings → Pages**
2. Set **Source** to your `main` branch, root folder
3. Visit `https://YOUR_USERNAME.github.io/REPO_NAME/`

---

## 📤 GitHub Upload Instructions

### Using the command line

```bash
# 1. Initialize a new git repo in the project folder
cd medtrack
git init
git add .
git commit -m "Initial commit: MedTrack inventory system"

# 2. Create an empty repo on GitHub (via the website),
#    then link and push:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/medtrack.git
git push -u origin main
```

### Using the GitHub website (no command line)

1. Go to **github.com** and click **New repository**.
2. Name it (e.g., `medtrack`) and click **Create**.
3. On the new repo page, click **uploading an existing file**.
4. Drag and drop:
   - `index.html`
   - `style.css`
   - `script.js`
   - `README.md`
5. Commit the changes.

Your project is now on GitHub.

### Using GitHub Desktop

1. Open **GitHub Desktop** → **File → Add Local Repository** → select the project folder.
2. Publish the repository.

---

## 💾 How `localStorage` Works

MedTrack stores all data in your browser's `localStorage` under a single key: `medtrack.v1`. Here's what you need to know:

### What's stored
A JSON object containing:
- `passcode` — your access code
- `offices` — array of office records `{ id, name, address, createdAt }`
- `inventory` — array of machine records `{ id, serialNumber, model, maker, officeId, notes, dateAdded }`
- `meta` — timestamps for last activity

### Persistence rules
- Data is saved **immediately** after every change (add/edit/delete).
- Data persists across browser sessions, restarts, and machine reboots.
- Data is **scoped to one browser on one device**. Opening the app in a different browser or on a different computer starts fresh.
- Clearing site data / browser cache **erases all MedTrack data** — use **Data → Full Backup** regularly.
- Private/incognito windows have their own isolated storage that vanishes when the window closes.

### Storage limits
- Browsers typically allow **5–10 MB per origin** for localStorage.
- A single inventory record is roughly 200–300 bytes, so MedTrack comfortably handles tens of thousands of machines.
- Check current usage under **Settings → About**.

### Sharing data between devices
Since localStorage is browser-local, the recommended workflow for transferring data is:
1. **Data → Full Backup (JSON)** on the original device — downloads a `.json` file.
2. Move the file to the new device (email, cloud drive, USB stick).
3. **Data → Restore from Backup** on the new device.

---

## 📁 Project Structure

```
medtrack/
├── index.html      # Markup: views, modals, login screen
├── style.css       # Dark-mode design system + responsive layout
├── script.js       # All application logic (vanilla JS)
└── README.md       # This file
```

---

## 🧭 CSV Format Reference

When importing, MedTrack accepts these column names (case-sensitive header row):

| Column         | Required | Notes                                           |
| -------------- | -------- | ----------------------------------------------- |
| `serialNumber` | Yes      | Must be unique. Duplicates are skipped.         |
| `model`        | Yes      |                                                 |
| `maker`        | Yes      | Manufacturer name.                              |
| `officeName`   | Yes      | If the office doesn't exist, it's created.      |
| `notes`        | No       |                                                 |
| `dateAdded`    | No       | ISO date `YYYY-MM-DD`. Defaults to today.       |

Alternative header names recognized: `Serial Number`, `Model`, `Manufacturer`, `Office Location`, `Notes`, `Date Added`.

### Example CSV
```csv
serialNumber,model,maker,officeName,notes,dateAdded
SN-001,MRI Scanner Pro,Siemens,Downtown Clinic,Last serviced June 2024,2024-06-12
SN-002,Ultrasound XR,GE Healthcare,Northside Center,,2024-08-03
```

---

## ⌨️ Keyboard Shortcuts

| Key      | Action               |
| -------- | -------------------- |
| `/`      | Focus the search bar |
| `Esc`    | Close any open modal |
| `Enter`  | Submit active form   |

---

## 🛡️ Security Notes

This app is for **personal/local use**. The passcode is a convenience lock — not encryption. Anyone with access to the browser's developer tools or `localStorage` can read the stored data directly. Do not use it as the sole protection for sensitive patient information or regulated data.

For multi-user or HIPAA-compliant deployments, you'll want a real backend with proper authentication, encryption at rest, audit logs, and access controls.

---

## 🛠️ Tech Stack

- **HTML5** — semantic markup
- **CSS3** — custom properties, grid, flexbox, container queries-style responsive design
- **Vanilla JavaScript (ES2020)** — no frameworks, no build tools
- **Web Storage API** — `localStorage` for persistence
- **FileReader / Blob APIs** — for CSV/JSON import & export

---

## 📜 License

MIT — use, modify, and distribute freely.
