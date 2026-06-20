/* ===================================================================
   QR ATTENDANCE SYSTEM - app.js
   Vanilla JS frontend that talks to a Google Apps Script backend
=================================================================== */

const LS_KEYS = {
  SETTINGS: "qrAttendance_settings",
  THEME: "qrAttendance_theme"
};

let SETTINGS = {
  schoolName: "QR Attendance",
  schoolLogo: "",
  scriptUrl: ""
};

let DB = {
  students: [],
  courses: [],
  attendance: []
};

let currentQRStudent = null; // for download/print in modal
let html5QrCode = null;
let trendChartInstance = null;

/* ===================== INIT ===================== */
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  applyTheme(localStorage.getItem(LS_KEYS.THEME) || "light");
  bindNav();
  bindThemeToggle();
  bindSidebarToggle();
  bindStudentSearch();
  bindCsvImport();
  bindScannerButtons();

  if (SETTINGS.scriptUrl) {
    refreshAllData();
  } else {
    showToast("Connect your Google Apps Script URL in Settings to get started.", true);
  }

  // populate settings fields
  document.getElementById("settingSchoolName").value = SETTINGS.schoolName || "";
  document.getElementById("settingSchoolLogo").value = SETTINGS.schoolLogo || "";
  document.getElementById("settingScriptUrl").value = SETTINGS.scriptUrl || "";
  applyBranding();
});

/* ===================== SETTINGS ===================== */
function loadSettings() {
  const raw = localStorage.getItem(LS_KEYS.SETTINGS);
  if (raw) SETTINGS = Object.assign(SETTINGS, JSON.parse(raw));
}
function saveSettings() {
  SETTINGS.schoolName = document.getElementById("settingSchoolName").value.trim();
  SETTINGS.schoolLogo = document.getElementById("settingSchoolLogo").value.trim();
  SETTINGS.scriptUrl = document.getElementById("settingScriptUrl").value.trim();
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(SETTINGS));
  applyBranding();
  document.getElementById("settingsSaveMsg").textContent = "Saved ✓";
  setTimeout(() => document.getElementById("settingsSaveMsg").textContent = "", 2000);
  showToast("Settings saved successfully");
  if (SETTINGS.scriptUrl) refreshAllData();
}
function applyBranding() {
  document.getElementById("brandName").textContent = SETTINGS.schoolName || "QR Attendance";
  document.title = (SETTINGS.schoolName || "QR Attendance") + " - Attendance System";
  const logoEl = document.getElementById("brandLogo");
  if (SETTINGS.schoolLogo) {
    logoEl.style.backgroundImage = `url(${SETTINGS.schoolLogo})`;
    logoEl.style.backgroundSize = "cover";
    logoEl.textContent = "";
  }
}
document.getElementById("settingLogoFile")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("settingSchoolLogo").value = reader.result;
  };
  reader.readAsDataURL(file);
});

async function testConnection() {
  const url = document.getElementById("settingScriptUrl").value.trim();
  if (!url) { showToast("Enter a script URL first", true); return; }
  try {
    const res = await fetch(url + "?action=getStudents");
    const data = await res.json();
    if (data) {
      setConnStatus(true);
      showToast("Connection successful!");
    }
  } catch (err) {
    setConnStatus(false);
    showToast("Connection failed: " + err.message, true);
  }
}
function setConnStatus(online) {
  const pill = document.getElementById("connStatus");
  pill.textContent = online ? "Backend Connected" : "Backend Not Connected";
  pill.className = "status-pill " + (online ? "status-online" : "status-offline");
}

/* ===================== THEME ===================== */
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  document.getElementById("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(LS_KEYS.THEME, theme);
}
function bindThemeToggle() {
  document.getElementById("themeToggle").addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

/* ===================== NAV ===================== */
function bindNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      document.getElementById("page-" + page).classList.add("active");
      document.getElementById("sidebar").classList.remove("open");
      if (page === "dashboard") renderDashboard();
      if (page === "courses") renderCoursesTable();
      if (page === "students") renderStudentsTable();
      if (page === "reports") populateReportFilters();
      if (page === "scanner") renderRecentAttendance();
    });
  });
}
function bindSidebarToggle() {
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
}

/* ===================== TOAST ===================== */
function showToast(msg, isError) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ===================== BACKEND API HELPERS ===================== */
function apiUrl(action, params = {}) {
  const url = new URL(SETTINGS.scriptUrl);
  url.searchParams.set("action", action);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  return url.toString();
}

async function apiGet(action, params) {
  if (!SETTINGS.scriptUrl) throw new Error("No backend URL configured");
  const res = await fetch(apiUrl(action, params));
  return res.json();
}

async function apiPost(action, payload) {
  if (!SETTINGS.scriptUrl) throw new Error("No backend URL configured");
  // Apps Script web apps work best with text/plain to avoid CORS preflight
  const res = await fetch(SETTINGS.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload })
  });
  return res.json();
}

async function refreshAllData() {
  try {
    const [studentsRes, coursesRes, attendanceRes] = await Promise.all([
      apiGet("getStudents"),
      apiGet("getCourses"),
      apiGet("getAttendance")
    ]);
    DB.students = studentsRes.data || [];
    DB.courses = coursesRes.data || [];
    DB.attendance = attendanceRes.data || [];
    setConnStatus(true);
    renderDashboard();
    renderCoursesTable();
    renderStudentsTable();
    renderRecentAttendance();
    populateGroupFilters();
  } catch (err) {
    setConnStatus(false);
    showToast("Failed to load data: " + err.message, true);
  }
}

/* ===================== DASHBOARD ===================== */
function renderDashboard() {
  document.getElementById("statStudents").textContent = DB.students.length;
  document.getElementById("statCourses").textContent = DB.courses.length;

  const todayStr = formatDate(new Date());
  const todayCount = DB.attendance.filter(a => a.date === todayStr).length;
  document.getElementById("statToday").textContent = todayCount;

  const activeCourse = DB.courses.find(c => c.status === "Ongoing");
  document.getElementById("statActiveCourse").textContent = activeCourse ? activeCourse.courseName : "None";

  renderTrendChart();
}

function renderTrendChart() {
  const ctx = document.getElementById("trendChart");
  if (!ctx) return;
  const labels = [];
  const counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = formatDate(d);
    labels.push(ds.slice(5));
    counts.push(DB.attendance.filter(a => a.date === ds).length);
  }
  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Attendance",
        data: counts,
        borderColor: "#69C11F",
        backgroundColor: "rgba(105,193,31,0.15)",
        tension: 0.35,
        fill: true,
        pointRadius: 4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

/* ===================== COURSES ===================== */
function openCourseModal(course) {
  document.getElementById("courseModalTitle").textContent = course ? "Edit Course" : "New Course";
  document.getElementById("courseId").value = course ? course.courseId : "";
  document.getElementById("courseName").value = course ? course.courseName : "";
  document.getElementById("courseSubject").value = course ? course.subject : "";
  document.getElementById("courseGroup").value = course ? course.group : "";
  document.getElementById("courseTeacher").value = course ? course.teacher : "";
  document.getElementById("courseDuration").value = course ? course.duration : "";
  document.getElementById("courseStart").value = course ? course.startDate : "";
  document.getElementById("courseEnd").value = course ? course.endDate : "";
  document.getElementById("courseStatus").value = course ? course.status : "Draft";
  openModal("courseModalOverlay");
}

async function saveCourse() {
  const id = document.getElementById("courseId").value;
  const payload = {
    courseId: id || ("CRS" + Date.now()),
    courseName: document.getElementById("courseName").value.trim(),
    subject: document.getElementById("courseSubject").value.trim(),
    group: document.getElementById("courseGroup").value.trim(),
    teacher: document.getElementById("courseTeacher").value.trim(),
    duration: document.getElementById("courseDuration").value.trim(),
    startDate: document.getElementById("courseStart").value,
    endDate: document.getElementById("courseEnd").value,
    status: document.getElementById("courseStatus").value
  };
  if (!payload.courseName) { showToast("Course name is required", true); return; }
  try {
    const action = id ? "updateCourse" : "addCourse";
    const res = await apiPost(action, payload);
    if (res.success) {
      showToast(id ? "Course updated" : "Course created");
      closeModal("courseModalOverlay");
      await refreshAllData();
    } else {
      showToast(res.message || "Failed to save course", true);
    }
  } catch (err) { showToast(err.message, true); }
}

function renderCoursesTable() {
  const tbody = document.querySelector("#coursesTable tbody");
  tbody.innerHTML = "";
  DB.courses.forEach(c => {
    const tr = document.createElement("tr");
    const badgeClass = c.status === "Ongoing" ? "badge-ongoing" : c.status === "Completed" ? "badge-completed" : "badge-draft";
    tr.innerHTML = `
      <td>${escapeHtml(c.courseName)}</td>
      <td>${escapeHtml(c.subject)}</td>
      <td>${escapeHtml(c.group)}</td>
      <td>${escapeHtml(c.teacher)}</td>
      <td>${escapeHtml(c.duration)} d</td>
      <td>${escapeHtml(c.startDate)}</td>
      <td>${escapeHtml(c.endDate)}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(c.status)}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick='editCourseById("${c.courseId}")'>Edit</button>
        <button class="btn btn-sm btn-outline" onclick='archiveCourse("${c.courseId}")'>Archive</button>
        <button class="btn btn-sm btn-danger" onclick='deleteCourse("${c.courseId}")'>Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}
function editCourseById(id) {
  const c = DB.courses.find(x => x.courseId === id);
  if (c) openCourseModal(c);
}
async function archiveCourse(id) {
  const c = DB.courses.find(x => x.courseId === id);
  if (!c) return;
  c.status = "Completed";
  try {
    await apiPost("updateCourse", c);
    showToast("Course archived");
    refreshAllData();
  } catch (err) { showToast(err.message, true); }
}
async function deleteCourse(id) {
  if (!confirm("Delete this course? This cannot be undone.")) return;
  try {
    const res = await apiPost("deleteCourse", { courseId: id });
    if (res.success) { showToast("Course deleted"); refreshAllData(); }
  } catch (err) { showToast(err.message, true); }
}

/* ===================== STUDENTS ===================== */
function openStudentModal(student) {
  document.getElementById("studentModalTitle").textContent = student ? "Edit Student" : "Add Student";
  document.getElementById("studentEditingId").value = student ? student.studentId : "";
  document.getElementById("studentId").value = student ? student.studentId : "";
  document.getElementById("studentId").disabled = !!student;
  document.getElementById("studentFirstName").value = student ? student.firstName : "";
  document.getElementById("studentLastName").value = student ? student.lastName : "";
  document.getElementById("studentEmail").value = student ? student.email : "";
  document.getElementById("studentPhone").value = student ? student.phone : "";
  document.getElementById("studentGroup").value = student ? student.group : "";
  openModal("studentModalOverlay");
}

async function saveStudent() {
  const editingId = document.getElementById("studentEditingId").value;
  const payload = {
    studentId: document.getElementById("studentId").value.trim(),
    firstName: document.getElementById("studentFirstName").value.trim(),
    lastName: document.getElementById("studentLastName").value.trim(),
    email: document.getElementById("studentEmail").value.trim(),
    phone: document.getElementById("studentPhone").value.trim(),
    group: document.getElementById("studentGroup").value.trim()
  };
  if (!payload.studentId || !payload.firstName) {
    showToast("Student ID and First Name are required", true); return;
  }
  try {
    const action = editingId ? "updateStudent" : "addStudent";
    const res = await apiPost(action, payload);
    if (res.success) {
      showToast(editingId ? "Student updated" : "Student added");
      closeModal("studentModalOverlay");
      document.getElementById("studentId").disabled = false;
      await refreshAllData();
    } else {
      showToast(res.message || "Failed to save student", true);
    }
  } catch (err) { showToast(err.message, true); }
}

function renderStudentsTable() {
  const tbody = document.querySelector("#studentsTable tbody");
  tbody.innerHTML = "";
  const search = (document.getElementById("studentSearch")?.value || "").toLowerCase();
  const groupFilter = document.getElementById("studentGroupFilter")?.value || "";

  const filtered = DB.students.filter(s => {
    const matchesSearch = !search || [s.studentId, s.firstName, s.lastName, s.email].join(" ").toLowerCase().includes(search);
    const matchesGroup = !groupFilter || s.group === groupFilter;
    return matchesSearch && matchesGroup;
  });

  filtered.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><div class="mini-qr" id="mini-${escapeAttr(s.studentId)}"></div></td>
      <td>${escapeHtml(s.studentId)}</td>
      <td>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.phone)}</td>
      <td>${escapeHtml(s.group)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick='viewQR("${escapeAttr(s.studentId)}")'>QR</button>
        <button class="btn btn-sm btn-outline" onclick='editStudentById("${escapeAttr(s.studentId)}")'>Edit</button>
        <button class="btn btn-sm btn-danger" onclick='deleteStudent("${escapeAttr(s.studentId)}")'>Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // render small QR previews
  setTimeout(() => {
    filtered.forEach(s => {
      const holder = document.getElementById("mini-" + s.studentId);
      if (holder && !holder.dataset.rendered) {
        new QRCode(holder, { text: JSON.stringify({ studentId: s.studentId }), width: 40, height: 40 });
        holder.dataset.rendered = "1";
      }
    });
  }, 10);
}

function editStudentById(id) {
  const s = DB.students.find(x => x.studentId === id);
  if (s) openStudentModal(s);
}
async function deleteStudent(id) {
  if (!confirm("Delete this student?")) return;
  try {
    const res = await apiPost("deleteStudent", { studentId: id });
    if (res.success) { showToast("Student deleted"); refreshAllData(); }
  } catch (err) { showToast(err.message, true); }
}

function bindStudentSearch() {
  document.getElementById("studentSearch")?.addEventListener("input", renderStudentsTable);
  document.getElementById("studentGroupFilter")?.addEventListener("change", renderStudentsTable);
}
function populateGroupFilters() {
  const groups = [...new Set([
    ...DB.students.map(s => s.group),
    ...DB.courses.map(c => c.group)
  ].filter(Boolean))];

  const sel = document.getElementById("studentGroupFilter");
  if (sel) {
    sel.innerHTML = '<option value="">All Groups</option>' + groups.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
  }

  const datalist = document.getElementById("groupsDatalist");
  if (datalist) {
    datalist.innerHTML = groups.map(g => `<option value="${escapeAttr(g)}"></option>`).join("");
  }
}

/* ===================== STUDENT ID CARD GENERATION ===================== */

// QR codes need a blank white "quiet zone" border around them or scanners
// (especially phone cameras) cannot detect the finder patterns. qrcodejs
// renders a <canvas> (preferred, always present in modern browsers) and an
// <img> fallback that mirrors it — we must read from the CANVAS, not the
// img, otherwise the source can be blank/stale and produce a "borderless"
// or broken export. This was the root cause of previous scan failures.
function getQrCanvasOrImg(containerEl) {
  return containerEl.querySelector("canvas") || containerEl.querySelector("img");
}

// Renders a full "Student ID Card" style image: school header bar,
// full name, group, and a properly-quiet-zoned QR code underneath.
function buildIdCardCanvas(student, qrSourceEl) {
  const W = 480, H = 680;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // header bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#69C11F");
  grad.addColorStop(1, "#4CAF15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 110);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(SETTINGS.schoolName || "QR Attendance", W / 2, 50);
  ctx.font = "14px Segoe UI, Arial, sans-serif";
  ctx.fillText("Student Identification Card", W / 2, 78);

  // full name
  ctx.fillStyle = "#16201A";
  ctx.font = "bold 26px Segoe UI, Arial, sans-serif";
  const fullName = `${student.firstName || ""} ${student.lastName || ""}`.trim();
  ctx.fillText(fullName, W / 2, 160);

  // group + student id
  ctx.font = "16px Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#5B6B5F";
  ctx.fillText(`Group: ${student.group || "-"}`, W / 2, 190);
  ctx.fillText(`ID: ${student.studentId}`, W / 2, 214);

  // QR code with white quiet-zone padding, drawn from the source canvas
  const qrSize = 280;
  const qrX = (W - qrSize) / 2;
  const qrY = 250;
  const padding = 20;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2);
  ctx.strokeStyle = "#E3E9E0";
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2);
  ctx.drawImage(qrSourceEl, qrX, qrY, qrSize, qrSize);

  // footer
  ctx.fillStyle = "#9AA59C";
  ctx.font = "12px Segoe UI, Arial, sans-serif";
  ctx.fillText("Scan this code to check in", W / 2, qrY + qrSize + padding + 30);

  return canvas;
}

function viewQR(studentId) {
  const s = DB.students.find(x => x.studentId === studentId);
  if (!s) return;
  currentQRStudent = s;
  const holder = document.getElementById("qrModalCanvas");
  holder.innerHTML = "";
  new QRCode(holder, { text: JSON.stringify({ studentId: s.studentId }), width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });

  // qrcodejs renders asynchronously into canvas; small delay ensures it's ready
  setTimeout(() => {
    const qrEl = getQrCanvasOrImg(holder);
    const cardCanvas = buildIdCardCanvas(s, qrEl);
    currentIdCardDataUrl = cardCanvas.toDataURL("image/png");
    document.getElementById("idCardPreview").src = currentIdCardDataUrl;
  }, 80);

  openModal("qrModalOverlay");
}

let currentIdCardDataUrl = null;

function downloadCurrentQR() {
  if (!currentIdCardDataUrl || !currentQRStudent) return;
  const a = document.createElement("a");
  a.href = currentIdCardDataUrl;
  a.download = `ID_${currentQRStudent.studentId}.png`;
  a.click();
}

function printCurrentQR() {
  if (!currentIdCardDataUrl || !currentQRStudent) return;
  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>Print ID Card</title></head>
    <body style="text-align:center;font-family:sans-serif;">
      <img src="${currentIdCardDataUrl}" style="max-width:100%;" />
      <script>window.onload = () => { window.print(); }</script>
    </body></html>`);
  w.document.close();
}

async function shareCurrentQR() {
  if (!currentIdCardDataUrl || !currentQRStudent) return;
  try {
    const res = await fetch(currentIdCardDataUrl);
    const blob = await res.blob();
    const file = new File([blob], `ID_${currentQRStudent.studentId}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `${currentQRStudent.firstName} ${currentQRStudent.lastName} — Student ID`,
        text: `Student ID card for ${currentQRStudent.firstName} ${currentQRStudent.lastName} (${currentQRStudent.studentId})`
      });
      showToast("Shared successfully");
    } else {
      // Fallback: browsers without file-sharing support just get the download
      downloadCurrentQR();
      showToast("Sharing isn't supported on this browser — downloaded instead", true);
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      showToast("Share failed: " + err.message, true);
    }
  }
}

function printAllQR() {
  const container = document.getElementById("printAllContainer");
  container.innerHTML = "";
  const cardImages = [];

  DB.students.forEach(s => {
    const qrHolder = document.createElement("div");
    container.appendChild(qrHolder);
    new QRCode(qrHolder, { text: JSON.stringify({ studentId: s.studentId }), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    cardImages.push({ student: s, holder: qrHolder });
  });

  setTimeout(() => {
    const cardsHtml = cardImages.map(({ student, holder }) => {
      const qrEl = getQrCanvasOrImg(holder);
      const cardCanvas = buildIdCardCanvas(student, qrEl);
      const src = cardCanvas.toDataURL("image/png");
      return `<div class="print-card"><img src="${src}" style="width:100%;max-width:240px;" /></div>`;
    }).join("");

    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Print All Student ID Cards</title>
      <style>
        body { font-family: sans-serif; }
        .print-sheet { display:grid; grid-template-columns: repeat(2,1fr); gap: 16px; padding: 16px; }
        .print-card { text-align:center; }
      </style></head><body>
      <div class="print-sheet">${cardsHtml}</div>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  }, 400);
}

/* ===================== CSV IMPORT ===================== */
function bindCsvImport() {
  document.getElementById("csvInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    const header = rows[0].map(h => h.trim().toLowerCase());
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;
      const obj = {};
      header.forEach((h, idx) => obj[h] = (row[idx] || "").trim());
      const payload = {
        studentId: obj["studentid"] || obj["student id"] || obj["id"],
        firstName: obj["firstname"] || obj["first name"],
        lastName: obj["lastname"] || obj["last name"],
        email: obj["email"] || "",
        phone: obj["phone"] || "",
        group: obj["group"] || obj["level"] || ""
      };
      if (!payload.studentId) continue;
      try {
        await apiPost("addStudent", payload);
        imported++;
      } catch (err) { console.error(err); }
    }
    showToast(`Imported ${imported} students`);
    e.target.value = "";
    refreshAllData();
  });
}
function parseCSV(text) {
  return text.trim().split(/\r?\n/).map(line => line.split(","));
}

/* ===================== SCANNER ===================== */
function bindScannerButtons() {
  document.getElementById("startScanBtn").addEventListener("click", startScanner);
  document.getElementById("stopScanBtn").addEventListener("click", stopScanner);
  document.getElementById("manualCheckBtn").addEventListener("click", () => {
    const id = document.getElementById("manualStudentId").value.trim();
    if (id) { handleScannedId(id); document.getElementById("manualStudentId").value = ""; }
  });
}
function startScanner() {
  html5QrCode = new Html5Qrcode("qr-reader", {
    // Use the browser's native BarcodeDetector API when available — it's
    // hardware-accelerated and significantly faster than the pure-JS
    // decoder html5-qrcode falls back to otherwise.
    useBarCodeDetectorIfSupported: true,
    verbose: false
  });

  // Responsive qrbox: never exceeds the actual video viewfinder size.
  const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const boxSize = Math.floor(minEdge * 0.7);
    return { width: boxSize, height: boxSize };
  };

  const config = {
    fps: 20,                 // more scan attempts per second (was 10)
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
    disableFlip: true,       // skip mirrored-image decode attempt — codes aren't mirrored in real life, this halves the work per frame
    formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ] // skip checking for barcodes/other formats every frame
  };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      let studentId = decodedText;
      try {
        const parsed = JSON.parse(decodedText);
        if (parsed.studentId) studentId = parsed.studentId;
      } catch (e) { /* plain text id */ }
      handleScannedId(studentId);
    },
    () => { /* scan failure callback fires constantly while searching — ignore */ }
  ).then(() => {
    document.getElementById("startScanBtn").disabled = true;
    document.getElementById("stopScanBtn").disabled = false;
  }).catch(err => {
    showToast("Camera error: " + err, true);
    console.error("Camera start error:", err);
  });
}
function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      document.getElementById("startScanBtn").disabled = false;
      document.getElementById("stopScanBtn").disabled = true;
    });
  }
}


let lastScanTime = 0;
async function handleScannedId(studentId) {
  const now = Date.now();
  if (now - lastScanTime < 2500) return; // debounce
  lastScanTime = now;

  const resultCard = document.getElementById("scanResultCard");
  resultCard.innerHTML = `<div class="scan-result-placeholder">Processing ${escapeHtml(studentId)}...</div>`;

  try {
    const res = await apiPost("addAttendance", { studentId });

    if (res.success) {
      const d = res.data;
      resultCard.innerHTML = `
        <div class="scan-result-success">
          <div class="scan-result-icon">✅</div>
          <h3>Attendance Recorded Successfully</h3>
          <div class="scan-identity">
            <div class="scan-avatar">${escapeHtml(getInitials(d.studentName))}</div>
            <div class="scan-identity-text">
              <div class="scan-fullname">${escapeHtml(d.studentName)}</div>
              <div class="scan-group-badge">${escapeHtml(d.studentGroup || "No Group")}</div>
            </div>
          </div>
          <p class="muted">${escapeHtml(d.courseName || "")} • ${escapeHtml(d.time)}</p>
        </div>`;
    } else if (res.code === "ALREADY_CHECKED_IN") {
      const d = res.data || {};
      resultCard.innerHTML = `
        <div class="scan-result-error">
          <div class="scan-result-icon">⚠️</div>
          <h3>Already Checked In</h3>
          <div class="scan-identity">
            <div class="scan-avatar">${escapeHtml(getInitials(d.studentName || studentId))}</div>
            <div class="scan-identity-text">
              <div class="scan-fullname">${escapeHtml(d.studentName || studentId)}</div>
              <div class="scan-group-badge">${escapeHtml(d.studentGroup || "No Group")}</div>
            </div>
          </div>
          <p class="muted">${escapeHtml(res.message)}</p>
        </div>`;
    } else {
      resultCard.innerHTML = `
        <div class="scan-result-error">
          <div class="scan-result-icon">❌</div>
          <h3>Check-in Failed</h3>
          <p>${escapeHtml(res.message || "Unknown error")}</p>
        </div>`;
    }
    refreshAllData();
  } catch (err) {
    resultCard.innerHTML = `<div class="scan-result-error"><div class="scan-result-icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || "").join("");
}

function renderRecentAttendance() {
  const tbody = document.querySelector("#recentAttendanceTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const todayStr = formatDate(new Date());
  const groupMap = {};
  DB.students.forEach(s => groupMap[s.studentId] = s.group);

  DB.attendance.filter(a => a.date === todayStr)
    .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
    .forEach(a => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(a.studentId)}</td><td>${escapeHtml(a.studentName)}</td><td>${escapeHtml(groupMap[a.studentId] || "")}</td><td>${escapeHtml(a.courseName)}</td><td>${escapeHtml(a.time)}</td>`;
      tbody.appendChild(tr);
    });
}

/* ===================== REPORTS ===================== */
function populateReportFilters() {
  const courseSel = document.getElementById("reportCourse");
  const studentSel = document.getElementById("reportStudent");
  const groupSel = document.getElementById("reportGroup");

  courseSel.innerHTML = '<option value="">All Courses</option>' +
    DB.courses.map(c => `<option value="${escapeAttr(c.courseId)}">${escapeHtml(c.courseName)}</option>`).join("");
  studentSel.innerHTML = '<option value="">All Students</option>' +
    DB.students.map(s => `<option value="${escapeAttr(s.studentId)}">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</option>`).join("");
  const groups = [...new Set(DB.students.map(s => s.group).filter(Boolean))];
  groupSel.innerHTML = '<option value="">All Groups</option>' + groups.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
}

let lastReportRows = [];
function runReport() {
  const courseId = document.getElementById("reportCourse").value;
  const studentId = document.getElementById("reportStudent").value;
  const group = document.getElementById("reportGroup").value;
  let start = document.getElementById("reportStart").value;
  let end = document.getElementById("reportEnd").value;
  const type = document.getElementById("reportType").value;

  const today = new Date();
  if (type === "daily") { start = end = formatDate(today); }
  if (type === "weekly") {
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    start = formatDate(weekAgo); end = formatDate(today);
  }
  if (type === "monthly") {
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);
    start = formatDate(monthAgo); end = formatDate(today);
  }

  const studentGroupMap = {};
  DB.students.forEach(s => studentGroupMap[s.studentId] = s.group);

  const rows = DB.attendance.filter(a => {
    if (courseId && a.courseId !== courseId) return false;
    if (studentId && a.studentId !== studentId) return false;
    if (group && studentGroupMap[a.studentId] !== group) return false;
    if (start && a.date < start) return false;
    if (end && a.date > end) return false;
    return true;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  lastReportRows = rows;
  const tbody = document.querySelector("#reportTable tbody");
  tbody.innerHTML = rows.map(r => `
    <tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.time)}</td><td>${escapeHtml(r.studentId)}</td><td>${escapeHtml(r.studentName)}</td><td>${escapeHtml(r.courseName)}</td></tr>
  `).join("") || `<tr><td colspan="5" class="muted">No records found</td></tr>`;
}

function exportReportCSV() {
  if (!lastReportRows.length) { showToast("Run a report first", true); return; }
  const header = ["Date", "Time", "Student ID", "Student Name", "Course"];
  const lines = [header.join(",")].concat(
    lastReportRows.map(r => [r.date, r.time, r.studentId, r.studentName, r.courseName].map(csvEscape).join(","))
  );
  downloadFile("attendance_report.csv", lines.join("\n"), "text/csv");
}
function exportReportExcel() {
  if (!lastReportRows.length) { showToast("Run a report first", true); return; }
  // Simple Excel-compatible HTML table export (.xls)
  let html = "<table><tr><th>Date</th><th>Time</th><th>Student ID</th><th>Student Name</th><th>Course</th></tr>";
  lastReportRows.forEach(r => {
    html += `<tr><td>${r.date}</td><td>${r.time}</td><td>${r.studentId}</td><td>${r.studentName}</td><td>${r.courseName}</td></tr>`;
  });
  html += "</table>";
  downloadFile("attendance_report.xls", html, "application/vnd.ms-excel");
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function csvEscape(val) {
  val = String(val ?? "");
  if (val.includes(",") || val.includes('"')) return '"' + val.replace(/"/g, '""') + '"';
  return val;
}

/* ===================== MODAL HELPERS ===================== */
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
});

/* ===================== UTILS ===================== */
function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }
