# QR Attendance System

A complete, frontend-only school attendance management system built with **plain HTML, CSS, and vanilla JavaScript**, using **Google Sheets** (via **Google Apps Script**) as the database. Students check in by scanning a QR code that contains only their Student ID.

No frameworks. No build tools. No Node backend. Deployable directly on **GitHub Pages**.

---

## ✨ Features

- 📊 **Dashboard** — total students, total courses, today's attendance, active course, 7-day attendance trend chart
- 📚 **Courses** — create / edit / delete / archive, status: Draft / Ongoing / Completed
- 🧑‍🎓 **Students** — add, edit, delete, search & filter, CSV import, auto QR code generation
- 🖨️ **QR Codes** — view, download, print single QR, print all QR codes as a printable A4 sheet
- 📷 **Scanner** — live camera QR scanning (html5-qrcode) + manual ID entry fallback
- ✅ **Attendance rules** — duplicate check-in prevention per student per day, active-course detection
- 📈 **Reports** — filter by course/student/level/date range, daily/weekly/monthly presets, CSV & Excel export
- ⚙️ **Settings** — school name/logo, Apps Script backend URL, stored in `localStorage`
- 🌓 **Light/Dark mode** — toggle, preference saved in `localStorage`
- 📱 Fully responsive — mobile, tablet, desktop

---

## 📁 Project Files

```
qr-attendance-app/
├── index.html           # All pages (SPA-style sections)
├── styles.css            # Theme, layout, responsive styles
├── app.js                 # All frontend logic + API calls
├── Code.gs                 # Google Apps Script backend
├── students_sample.csv      # Sample CSV for bulk import
└── README.md
```

---

## 🚀 Setup Instructions

### Step 1 — Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it something like `QR Attendance DB`.
3. You do **not** need to manually create tabs/columns — the script will create the `Students`, `Courses`, and `Attendance` sheets automatically the first time it runs.

### Step 2 — Add the Apps Script Backend

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Delete any starter code in `Code.gs`.
3. Copy the entire contents of this project's **`Code.gs`** file and paste it in.
4. Click the 💾 **Save** icon.

### Step 3 — Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Configure:
   - **Description:** QR Attendance API (or anything)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. Authorize the script when prompted (click through the "unsafe" warning — it's your own script).
6. Copy the generated **Web app URL**. It looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

> ⚠️ Whenever you edit `Code.gs`, you must create a **new deployment version** (Deploy → Manage deployments → Edit → New version) for changes to take effect on the same URL, OR deploy a new one and update the URL in Settings.

### Step 4 — Run the Frontend

You have two options:

**Option A — Run locally**
1. Open `index.html` directly in your browser (double-click it), or serve the folder with any static server.

**Option B — Deploy to GitHub Pages**
1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages** in your repo.
3. Set the source branch (e.g. `main`) and root folder.
4. Visit the generated GitHub Pages URL.

### Step 5 — Connect the Backend

1. Open the app, go to **Settings**.
2. Paste your Apps Script Web App URL into **"Apps Script Web App URL"**.
3. (Optional) Set your **School Name** and **Logo**.
4. Click **Save Settings**, then **Test Connection** — you should see "Backend Connected" in the top bar.

### Step 6 — Add Data

1. Go to **Courses** → create at least one course and set its status to **Ongoing** (attendance can only be recorded against an Ongoing course).
2. Go to **Students** → add students manually, or click **Import CSV** and upload `students_sample.csv` (or your own file with the same column headers: `StudentID, FirstName, LastName, Email, Phone, Level`).
3. Each student automatically gets a QR code containing `{"studentId":"STD001"}`.

### Step 7 — Scan Attendance

1. Go to the **Scanner** page.
2. Click **Start Camera** and allow camera permissions (works best on HTTPS — GitHub Pages serves HTTPS by default).
3. Point the camera at a student's QR code (or use the manual entry field).
4. The system will:
   - Look up the student
   - Find the active (Ongoing) course
   - Save attendance with date/time/timestamp
   - Show **"Attendance Recorded Successfully"** or **"Already Checked In"** if scanned again the same day.

---

## 🗄️ Google Sheets Schema

### Students
| StudentID | FirstName | LastName | Email | Phone | Level | QRCodeURL | CreatedAt |

### Courses
| CourseID | CourseName | Subject | Level | Teacher | Duration | StartDate | EndDate | Status | CreatedAt |

### Attendance
| AttendanceID | StudentID | StudentName | CourseID | CourseName | Date | Time | Timestamp |

---

## 🔌 API Reference (Apps Script)

All requests go to your deployed Web App URL.

**GET requests** (`?action=...`):
- `getStudents`
- `getCourses`
- `getAttendance`

**POST requests** (JSON body: `{ "action": "...", "payload": {...} }`):
- `addStudent`, `updateStudent`, `deleteStudent`
- `addCourse`, `updateCourse`, `deleteCourse`
- `addAttendance` → `{ studentId: "STD001" }`

All responses are JSON: `{ success: boolean, data?, message? }`.

---

## 🎨 Design

| Token | Color |
|---|---|
| Primary Green | `#69C11F` |
| Secondary Green | `#4CAF15` |
| Accent Green | `#00E676` |
| Light Background | `#F8FAF7` |
| Dark Background | `#0F1115` |
| Dark Cards | `#1A1D24` |

Theme preference (light/dark) is stored in `localStorage` and persists across sessions.

---

## 🛠️ Tech Stack

- HTML5 / CSS3 / Vanilla JavaScript (ES6+)
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — camera QR scanning (CDN)
- [qrcodejs](https://github.com/davidshimjs/qrcodejs) — QR code generation (CDN)
- [Chart.js](https://www.chartjs.org/) — dashboard trend chart (CDN)
- Google Apps Script + Google Sheets — serverless backend/database

---

## ⚠️ Notes & Limitations

- Camera scanning requires HTTPS (or `localhost`) due to browser security — GitHub Pages works fine.
- Apps Script Web Apps deployed with "Execute as: Me" run under the sheet owner's permissions; no Google login is required for end users.
- Apps Script has daily execution quotas on free Google accounts — sufficient for typical classroom/small-school use.
- The "Print All QR" feature renders all student QR codes into a printable A4-style grid in a new browser tab.
