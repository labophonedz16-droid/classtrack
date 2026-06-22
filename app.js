/* ===================================================================
   QR ATTENDANCE SYSTEM - app.js
=================================================================== */

const LS_KEYS = { SETTINGS: "qrAttendance_settings", THEME: "qrAttendance_theme" };

let SETTINGS = { schoolName: "QR Attendance", schoolLogo: "", scriptUrl: "" };

let DB = { students: [], courses: [], attendance: [] };

let currentQRStudent = null;
let currentIdCardDataUrl = null;
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
  bindCourseDateCalc();

  document.getElementById("settingSchoolName").value = SETTINGS.schoolName || "";
  document.getElementById("settingSchoolLogo").value = SETTINGS.schoolLogo || "";
  document.getElementById("settingScriptUrl").value  = SETTINGS.scriptUrl  || "";
  applyBranding();

  if (SETTINGS.scriptUrl) {
    refreshAllData();
  } else {
    showToast("Connect your Google Apps Script URL in Settings to get started.", true);
    renderCoursePage(); // show "no course" state
  }
});

/* ===================== SETTINGS ===================== */
function loadSettings() {
  const raw = localStorage.getItem(LS_KEYS.SETTINGS);
  if (raw) SETTINGS = Object.assign(SETTINGS, JSON.parse(raw));
}
function saveSettings() {
  SETTINGS.schoolName = document.getElementById("settingSchoolName").value.trim();
  SETTINGS.schoolLogo = document.getElementById("settingSchoolLogo").value.trim();
  SETTINGS.scriptUrl  = document.getElementById("settingScriptUrl").value.trim();
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(SETTINGS));
  applyBranding();
  document.getElementById("settingsSaveMsg").textContent = "Saved ✓";
  setTimeout(() => document.getElementById("settingsSaveMsg").textContent = "", 2000);
  showToast("Settings saved");
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
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { document.getElementById("settingSchoolLogo").value = reader.result; };
  reader.readAsDataURL(file);
});
async function testConnection() {
  const url = document.getElementById("settingScriptUrl").value.trim();
  if (!url) { showToast("Enter a script URL first", true); return; }
  try {
    const res = await fetch(url + "?action=getStudents");
    const data = await res.json();
    if (data) { setConnStatus(true); showToast("Connection successful!"); }
  } catch (err) { setConnStatus(false); showToast("Connection failed: " + err.message, true); }
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
    applyTheme(document.body.getAttribute("data-theme") === "dark" ? "light" : "dark");
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
      if (page === "course")    renderCoursePage();
      if (page === "students")  renderStudentsTable();
      if (page === "reports")   { populateReportFilters(); runAttendanceMatrix(); }
      if (page === "scanner")   { populateScannerGroupFilter(); renderRecentAttendance(); }
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

/* ===================== BACKEND API ===================== */
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
    DB.students   = studentsRes.data   || [];
    DB.courses    = coursesRes.data    || [];
    DB.attendance = attendanceRes.data || [];
    setConnStatus(true);
    renderDashboard();
    renderCoursePage();
    renderStudentsTable();
    renderRecentAttendance();
    populateGroupFilters();
    populateScannerGroupFilter();
  } catch (err) {
    setConnStatus(false);
    showToast("Failed to load data: " + err.message, true);
  }
}
async function refreshAttendanceOnly() {
  try {
    const res = await apiGet("getAttendance");
    DB.attendance = res.data || [];
    renderRecentAttendance();
    const todayStr = formatDate(new Date());
    setText("statToday", DB.attendance.filter(a => a.date === todayStr).length);
  } catch (err) { console.warn("Attendance refresh failed:", err.message); }
}
async function forceReloadData() {
  if (!SETTINGS.scriptUrl) { showToast("No backend URL configured", true); return; }
  const btn = document.getElementById("reloadDataBtn");
  const msg = document.getElementById("reloadDataMsg");
  btn.disabled = true;
  btn.textContent = "🔄 Reloading...";
  msg.textContent = "";
  try {
    await refreshAllData();
    msg.textContent = "✓ Reloaded at " + new Date().toLocaleTimeString();
    showToast("Data reloaded from Sheets");
  } catch (err) {
    msg.textContent = "✗ Failed: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Reload All Data from Sheets";
  }
}

/* ===================== DASHBOARD ===================== */
function renderDashboard() {
  setText("statStudents", DB.students.length);
  const todayStr = formatDate(new Date());
  setText("statToday", DB.attendance.filter(a => a.date === todayStr).length);
  const activeCourse = DB.courses.find(c => c.status === "Ongoing");
  setText("statActiveCourse", activeCourse ? activeCourse.courseName : "None");

  // Sessions completed = past weekdays in course range
  const allDays = activeCourse ? getCourseDays(activeCourse) : [];
  const passedDays = allDays.filter(d => d < todayStr);
  setText("statPassedSessions", passedDays.length);

  renderDashboardAbsences(activeCourse, passedDays);
  renderTrendChart();
}

function renderDashboardAbsences(activeCourse, passedDays) {
  const absenceRow = document.getElementById("dashboardAbsenceRow");
  const absentCard = document.getElementById("dashboardAbsentCard");
  if (!activeCourse || !passedDays.length) {
    if (absenceRow) absenceRow.style.display = "none";
    if (absentCard) absentCard.style.display = "none";
    return;
  }
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = formatDate(yesterdayDate);
  if (!passedDays.includes(yesterdayStr)) {
    if (absenceRow) absenceRow.style.display = "none";
    if (absentCard) absentCard.style.display = "none";
    return;
  }
  const attendedYesterday = new Set(
    DB.attendance.filter(a => a.date === yesterdayStr && String(a.courseId).trim() === String(activeCourse.courseId).trim())
      .map(a => a.studentId)
  );
  const absentStudents = DB.students.filter(s => !attendedYesterday.has(s.studentId));
  setText("statYesterdayAbsent", absentStudents.length);
  if (absenceRow) absenceRow.style.display = "";
  if (!absentStudents.length) { if (absentCard) absentCard.style.display = "none"; return; }
  if (absentCard) absentCard.style.display = "";
  setText("dashboardYesterdayLabel", yesterdayStr);
  document.querySelector("#dashboardAbsentTable tbody").innerHTML =
    absentStudents.map(s => `<tr>
      <td>${escapeHtml(s.studentId)}</td>
      <td>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</td>
      <td>${escapeHtml(s.group)}</td>
    </tr>`).join("");
}

function renderTrendChart() {
  const ctx = document.getElementById("trendChart");
  if (!ctx) return;
  const labels = [], counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = formatDate(d);
    labels.push(ds.slice(5));
    counts.push(DB.attendance.filter(a => a.date === ds).length);
  }
  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Attendance", data: counts, borderColor: "#69C11F", backgroundColor: "rgba(105,193,31,0.15)", tension: 0.35, fill: true, pointRadius: 4 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

/* ===================== COURSE PAGE (single-course system) ===================== */
function renderCoursePage() {
  const noneCard   = document.getElementById("courseNoneCard");
  const activeCard = document.getElementById("courseActiveCard");
  // We use the first course (system supports one at a time)
  const course = DB.courses[0] || null;

  if (!course) {
    noneCard.style.display = "";
    activeCard.style.display = "none";
    return;
  }

  noneCard.style.display = "none";
  activeCard.style.display = "";

  const todayStr = formatDate(new Date());
  const allDays  = getCourseDays(course);
  const passedDays = allDays.filter(d => d < todayStr);
  const isEnded  = course.endDate && normalizeDate(course.endDate) < todayStr;

  const badgeClass = course.status === "Ongoing" ? "badge-ongoing" : course.status === "Completed" ? "badge-completed" : "badge-draft";

  document.getElementById("courseInfoDisplay").innerHTML = `
    <div class="course-card-header">
      <div>
        <h2 style="margin:0 0 4px">${escapeHtml(course.courseName)}</h2>
        <p class="muted" style="margin:0">${escapeHtml(course.subject || "")}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <span class="badge ${badgeClass}">${escapeHtml(course.status)}</span>
        <button class="btn btn-sm btn-outline" onclick="openCourseModal(DB.courses[0])">✏️ Edit</button>
      </div>
    </div>
    <div class="course-stats-row">
      <div class="course-stat"><span class="course-stat-label">Start</span><span class="course-stat-value">${escapeHtml(normalizeDate(course.startDate))}</span></div>
      <div class="course-stat"><span class="course-stat-label">End</span><span class="course-stat-value">${escapeHtml(normalizeDate(course.endDate))}</span></div>
      <div class="course-stat"><span class="course-stat-label">Duration</span><span class="course-stat-value">${allDays.length} days</span></div>
      <div class="course-stat"><span class="course-stat-label">Completed</span><span class="course-stat-value">${passedDays.length} / ${allDays.length}</span></div>
      <div class="course-stat"><span class="course-stat-label">Students</span><span class="course-stat-value">${DB.students.length}</span></div>
    </div>`;

  const endedBanner = document.getElementById("courseEndedBanner");
  endedBanner.style.display = isEnded || course.status === "Completed" ? "" : "none";
}

function openCourseModal(course) {
  document.getElementById("courseModalTitle").textContent = course ? "Edit Course" : "New Course";
  document.getElementById("courseId").value = course ? course.courseId : "";
  document.getElementById("courseName").value = course ? course.courseName : "";
  document.getElementById("courseSubject").value = course ? (course.subject || "") : "";
  document.getElementById("courseStart").value = course ? normalizeDate(course.startDate) : "";
  document.getElementById("courseEnd").value   = course ? normalizeDate(course.endDate)   : "";
  document.getElementById("courseStatus").value = course ? course.status : "Ongoing";
  updateCourseDurationDisplay();
  openModal("courseModalOverlay");
}

function bindCourseDateCalc() {
  document.getElementById("courseStart").addEventListener("change", updateCourseDurationDisplay);
  document.getElementById("courseEnd").addEventListener("change",   updateCourseDurationDisplay);
}

function updateCourseDurationDisplay() {
  const start = document.getElementById("courseStart").value;
  const end   = document.getElementById("courseEnd").value;
  const el    = document.getElementById("courseDurationDisplay");
  if (start && end) {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end   + "T00:00:00");
    const days = Math.round((e - s) / 86400000) + 1;
    el.value = days > 0 ? `${days} day${days !== 1 ? "s" : ""} (${start} → ${end})` : "End date must be after start date";
  } else {
    el.value = "Select start and end dates";
  }
}

async function saveCourse() {
  const id    = document.getElementById("courseId").value;
  const start = document.getElementById("courseStart").value;
  const end   = document.getElementById("courseEnd").value;
  const days  = (start && end) ? getCourseDays({ startDate: start, endDate: end }).length : 0;

  const payload = {
    courseId:   id || ("CRS" + Date.now()),
    courseName: document.getElementById("courseName").value.trim(),
    subject:    document.getElementById("courseSubject").value.trim(),
    group:      "",
    teacher:    "",
    duration:   String(days),
    startDate:  start,
    endDate:    end,
    status:     document.getElementById("courseStatus").value
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

function confirmNewCourse() {
  closeModal("courseModalOverlay");
  openModal("newCourseModalOverlay");
}

async function downloadCourseData() {
  // Export students + attendance as two CSV files in a zip-like sequence
  // Students CSV
  const sHeader = ["StudentID","FirstName","LastName","Email","Phone","Group"];
  const sLines  = [sHeader.join(",")].concat(DB.students.map(s =>
    [s.studentId, s.firstName, s.lastName, s.email, s.phone, s.group].map(csvEscape).join(",")));
  downloadFile("students_backup.csv", sLines.join("\n"), "text/csv");

  // Attendance CSV (short delay so both downloads fire)
  setTimeout(() => {
    const aHeader = ["AttendanceID","StudentID","StudentName","CourseID","CourseName","Date","Time","Timestamp"];
    const aLines  = [aHeader.join(",")].concat(DB.attendance.map(a =>
      [a.attendanceId, a.studentId, a.studentName, a.courseId, a.courseName, a.date, a.time, a.timestamp].map(csvEscape).join(",")));
    downloadFile("attendance_backup.csv", aLines.join("\n"), "text/csv");
  }, 600);

  showToast("Downloading students and attendance data…");
}

async function resetAndStartNew() {
  closeModal("newCourseModalOverlay");
  try {
    const res = await apiPost("resetDatabase", {});
    if (res.success) {
      DB.students = [];
      DB.courses  = [];
      DB.attendance = [];
      renderDashboard();
      renderCoursePage();
      renderStudentsTable();
      renderRecentAttendance();
      showToast("Database cleared. You can now create a new course.");
    } else {
      showToast(res.message || "Reset failed", true);
    }
  } catch (err) { showToast(err.message, true); }
}

/* ===================== STUDENTS ===================== */
function openStudentModal(student) {
  document.getElementById("studentModalTitle").textContent = student ? "Edit Student" : "Add Student";
  document.getElementById("studentEditingId").value = student ? student.studentId : "";
  document.getElementById("studentId").value = student ? student.studentId : "";
  document.getElementById("studentId").disabled = !!student;
  document.getElementById("studentFirstName").value = student ? student.firstName : "";
  document.getElementById("studentLastName").value  = student ? student.lastName  : "";
  document.getElementById("studentEmail").value     = student ? student.email     : "";
  document.getElementById("studentPhone").value     = student ? student.phone     : "";
  document.getElementById("studentGroup").value     = student ? student.group     : "";
  openModal("studentModalOverlay");
}
async function saveStudent() {
  const editingId = document.getElementById("studentEditingId").value;
  const payload = {
    studentId: document.getElementById("studentId").value.trim(),
    firstName: document.getElementById("studentFirstName").value.trim(),
    lastName:  document.getElementById("studentLastName").value.trim(),
    email:     document.getElementById("studentEmail").value.trim(),
    phone:     document.getElementById("studentPhone").value.trim(),
    group:     document.getElementById("studentGroup").value.trim()
  };
  if (!payload.studentId || !payload.firstName) { showToast("Student ID and First Name are required", true); return; }
  try {
    const action = editingId ? "updateStudent" : "addStudent";
    const res = await apiPost(action, payload);
    if (res.success) {
      showToast(editingId ? "Student updated" : "Student added");
      closeModal("studentModalOverlay");
      document.getElementById("studentId").disabled = false;
      await refreshAllData();
    } else { showToast(res.message || "Failed to save student", true); }
  } catch (err) { showToast(err.message, true); }
}
function renderStudentsTable() {
  const tbody = document.querySelector("#studentsTable tbody");
  tbody.innerHTML = "";
  const search      = (document.getElementById("studentSearch")?.value || "").toLowerCase();
  const groupFilter = document.getElementById("studentGroupFilter")?.value || "";
  const filtered = DB.students.filter(s => {
    const matchesSearch = !search || [s.studentId, s.firstName, s.lastName, s.email].join(" ").toLowerCase().includes(search);
    const matchesGroup  = !groupFilter || s.group === groupFilter;
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
        <button class="btn btn-sm btn-danger"  onclick='deleteStudent("${escapeAttr(s.studentId)}")'>Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
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
  const groups = [...new Set(DB.students.map(s => s.group).filter(Boolean))];
  const sel = document.getElementById("studentGroupFilter");
  if (sel) sel.innerHTML = '<option value="">All Groups</option>' + groups.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
  const datalist = document.getElementById("groupsDatalist");
  if (datalist) datalist.innerHTML = groups.map(g => `<option value="${escapeAttr(g)}"></option>`).join("");
}

function generateStudentId() {
  // Format: DDMM-XXXX where DDMM is from course start date
  const course = DB.courses[0] || null;
  let prefix = "0000";
  if (course && course.startDate) {
    const d = new Date(normalizeDate(course.startDate) + "T00:00:00");
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      prefix = dd + mm;
    }
  }
  // Find the highest existing sequence number for this prefix
  const pattern = new RegExp("^" + prefix + "-(\\d+)$");
  let maxSeq = 0;
  DB.students.forEach(s => {
    const m = String(s.studentId).match(pattern);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  });
  // Also check what's typed in the form already
  const current = document.getElementById("studentId")?.value || "";
  const cm = current.match(pattern);
  if (cm) maxSeq = Math.max(maxSeq, parseInt(cm[1], 10));

  const next = String(maxSeq + 1).padStart(4, "0");
  const newId = `${prefix}-${next}`;
  const input = document.getElementById("studentId");
  if (input) { input.value = newId; input.focus(); }
}

/* ===================== QR / ID CARD ===================== */
function getQrCanvasOrImg(containerEl) {
  return containerEl.querySelector("canvas") || containerEl.querySelector("img");
}
function buildIdCardCanvas(student, qrSourceEl) {
  const W = 480, H = 680;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#69C11F"); grad.addColorStop(1, "#4CAF15");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Segoe UI, Arial, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(SETTINGS.schoolName || "QR Attendance", W/2, 50);
  ctx.font = "14px Segoe UI, Arial, sans-serif"; ctx.fillText("Student Identification Card", W/2, 78);
  ctx.fillStyle = "#16201A"; ctx.font = "bold 26px Segoe UI, Arial, sans-serif";
  ctx.fillText(`${student.firstName||""} ${student.lastName||""}`.trim(), W/2, 160);
  ctx.font = "16px Segoe UI, Arial, sans-serif"; ctx.fillStyle = "#5B6B5F";
  ctx.fillText(`Group: ${student.group||"-"}`, W/2, 190);
  ctx.fillText(`ID: ${student.studentId}`, W/2, 214);
  const qrSize = 280, qrX = (W-qrSize)/2, qrY = 250, padding = 20;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(qrX-padding, qrY-padding, qrSize+padding*2, qrSize+padding*2);
  ctx.strokeStyle = "#E3E9E0"; ctx.lineWidth = 2;
  ctx.strokeRect(qrX-padding, qrY-padding, qrSize+padding*2, qrSize+padding*2);
  ctx.drawImage(qrSourceEl, qrX, qrY, qrSize, qrSize);
  ctx.fillStyle = "#9AA59C"; ctx.font = "12px Segoe UI, Arial, sans-serif";
  ctx.fillText("Scan this code to check in", W/2, qrY+qrSize+padding+30);
  return canvas;
}
function viewQR(studentId) {
  const s = DB.students.find(x => x.studentId === studentId);
  if (!s) return;
  currentQRStudent = s;
  const holder = document.getElementById("qrModalCanvas");
  holder.innerHTML = "";
  new QRCode(holder, { text: JSON.stringify({ studentId: s.studentId }), width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
  setTimeout(() => {
    const qrEl = getQrCanvasOrImg(holder);
    const cardCanvas = buildIdCardCanvas(s, qrEl);
    currentIdCardDataUrl = cardCanvas.toDataURL("image/png");
    document.getElementById("idCardPreview").src = currentIdCardDataUrl;
  }, 80);
  openModal("qrModalOverlay");
}
function downloadCurrentQR() {
  if (!currentIdCardDataUrl || !currentQRStudent) return;
  const a = document.createElement("a");
  a.href = currentIdCardDataUrl; a.download = `ID_${currentQRStudent.studentId}.png`; a.click();
}
function printCurrentQR() {
  if (!currentIdCardDataUrl || !currentQRStudent) return;
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>Print ID Card</title></head><body style="text-align:center;font-family:sans-serif;"><img src="${currentIdCardDataUrl}" style="max-width:100%;" /><script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}
async function shareCurrentQR() {
  if (!currentIdCardDataUrl || !currentQRStudent) return;
  try {
    const res  = await fetch(currentIdCardDataUrl);
    const blob = await res.blob();
    const file = new File([blob], `ID_${currentQRStudent.studentId}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${currentQRStudent.firstName} ${currentQRStudent.lastName} — Student ID` });
      showToast("Shared successfully");
    } else { downloadCurrentQR(); showToast("Sharing not supported — downloaded instead", true); }
  } catch (err) { if (err.name !== "AbortError") showToast("Share failed: " + err.message, true); }
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
      return `<div class="print-card"><img src="${buildIdCardCanvas(student,qrEl).toDataURL("image/png")}" style="width:100%;max-width:240px;" /></div>`;
    }).join("");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Print All Student ID Cards</title><style>body{font-family:sans-serif;}.print-sheet{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding:16px;}.print-card{text-align:center;}</style></head><body><div class="print-sheet">${cardsHtml}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }, 400);
}

/* ===================== CSV IMPORT / EXPORT ===================== */
function bindCsvImport() {
  document.getElementById("csvInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
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
        lastName:  obj["lastname"]  || obj["last name"],
        email: obj["email"] || "",
        phone: obj["phone"] || "",
        group: obj["group"] || obj["level"] || ""
      };
      if (!payload.studentId) continue;
      try { await apiPost("addStudent", payload); imported++; } catch (err) { console.error(err); }
    }
    showToast(`Imported ${imported} students`);
    e.target.value = "";
    refreshAllData();
  });
}
function downloadExampleCSV() {
  const header = ["StudentID","FirstName","LastName","Email","Phone","Group"];
  const examples = [
    ["STD001","John","Doe","john.doe@example.com","+1234567890","Group A"],
    ["STD002","Jane","Smith","jane.smith@example.com","+1234567891","Group A"],
    ["STD003","Ahmed","Khan","ahmed.khan@example.com","+1234567892","Group B"],
    ["STD004","Maria","Garcia","maria.garcia@example.com","+1234567893","Group B"],
    ["STD005","Liam","Brown","liam.brown@example.com","+1234567894","Group C"]
  ];
  const lines = [header.join(",")].concat(examples.map(r => r.map(csvEscape).join(",")));
  downloadFile("students_example.csv", lines.join("\n"), "text/csv");
  showToast("Example CSV downloaded!");
}
function parseCSV(text) {
  return text.trim().split(/\r?\n/).map(line => line.split(","));
}

/* ===================== SCANNER ===================== */
/* ===================== SCANNER SETUP ===================== */
let currentClassType = "Theory"; // Theory | TP1 | TP2 | TP3

function selectClassType(type) {
  currentClassType = type;
  // Update button states
  document.querySelectorAll(".class-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.type === type);
  });
  const groupSel  = document.getElementById("scannerGroupFilter");
  const hint      = document.getElementById("groupFilterHint");
  const isTheory  = type === "Theory";
  if (groupSel) {
    groupSel.disabled = isTheory;
    if (isTheory) { groupSel.value = ""; }
  }
  if (hint) hint.textContent = isTheory ? "Theory class — all groups attend" : "Select the group for this TP session";
  updateSessionBadge();
}

function onGroupFilterChange() { updateSessionBadge(); }

function updateSessionBadge() {
  const badge     = document.getElementById("sessionBadge");
  if (!badge) return;
  const groupSel  = document.getElementById("scannerGroupFilter");
  const groupVal  = groupSel ? (groupSel.value || "All Groups") : "All Groups";
  const icons     = { Theory: "🌅", TP1: "①", TP2: "②", TP3: "③" };
  badge.textContent = `${icons[currentClassType] || "📋"} ${currentClassType}  ·  👥 ${groupVal}`;
}

function populateScannerGroupFilter() {
  const sel = document.getElementById("scannerGroupFilter");
  if (!sel) return;
  const groups = [...new Set(DB.students.map(s => s.group).filter(Boolean))];
  sel.innerHTML = '<option value="">🌐 All Groups</option>' +
    groups.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
  // Re-apply current class type state
  selectClassType(currentClassType);
}

function bindScannerButtons() {
  document.getElementById("startScanBtn").addEventListener("click", () => { getAudioCtx(); startScanner(); });
  document.getElementById("stopScanBtn").addEventListener("click", stopScanner);
  document.getElementById("manualCheckBtn").addEventListener("click", () => {
    getAudioCtx();
    const id = document.getElementById("manualStudentId").value.trim();
    if (id) { handleScannedId(id); document.getElementById("manualStudentId").value = ""; }
  });
}

/* ===================== SOUND EFFECTS ===================== */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function playTone(freq, duration, type="sine", delay=0, volume=0.25) {
  try {
    const ctx = getAudioCtx(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.value = volume;
    osc.connect(gain); gain.connect(ctx.destination);
    const t = ctx.currentTime + delay;
    osc.start(t); gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.stop(t + duration);
  } catch (e) {}
}
function playScanBeep()    { playTone(1400, 0.08, "square",   0,    0.18); }
function playSuccessSound(){ playTone(880,  0.12, "sine",     0,    0.22); playTone(1320, 0.16, "sine", 0.1, 0.22); }
function playErrorSound()  { playTone(420,  0.18, "sawtooth", 0,    0.18); playTone(280,  0.22, "sawtooth", 0.12, 0.18); }
function playRejectSound() { playTone(300,  0.25, "square",   0,    0.20); }

function startScanner() {
  html5QrCode = new Html5Qrcode("qr-reader", { useBarCodeDetectorIfSupported: true, verbose: false });
  const qrboxFunction = (w, h) => { const s = Math.floor(Math.min(w,h) * 0.7); return { width: s, height: s }; };
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 20, qrbox: qrboxFunction, aspectRatio: 1.0, disableFlip: true, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] },
    (decodedText) => {
      playScanBeep();
      let studentId = decodedText;
      try { const p = JSON.parse(decodedText); if (p.studentId) studentId = p.studentId; } catch (e) {}
      handleScannedId(studentId);
    },
    () => {}
  ).then(() => {
    document.getElementById("startScanBtn").disabled = true;
    document.getElementById("stopScanBtn").disabled  = false;
  }).catch(err => { showToast("Camera error: " + err, true); });
}
function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      document.getElementById("startScanBtn").disabled = false;
      document.getElementById("stopScanBtn").disabled  = true;
    });
  }
}

let lastScanTime = 0;
async function handleScannedId(studentId) {
  const now = Date.now();
  if (now - lastScanTime < 2500) return;
  lastScanTime = now;

  const resultCard = document.getElementById("scanResultCard");
  resultCard.innerHTML = `<div class="scan-result-placeholder">Processing ${escapeHtml(studentId)}…</div>`;

  const isTheory     = currentClassType === "Theory";
  const groupSel     = document.getElementById("scannerGroupFilter");
  const selectedGroup = (!isTheory && groupSel) ? (groupSel.value || "") : "";

  // Client-side group rejection for TP sessions
  if (!isTheory && selectedGroup) {
    const student = DB.students.find(s => String(s.studentId).trim() === String(studentId).trim());
    if (student && student.group !== selectedGroup) {
      playRejectSound();
      resultCard.innerHTML = `
        <div class="scan-result-reject">
          <div class="scan-result-icon">🚫</div>
          <h3>Wrong Group</h3>
          <div class="scan-identity">
            <div class="scan-avatar">${escapeHtml(getInitials(student.firstName + " " + student.lastName))}</div>
            <div class="scan-identity-text">
              <div class="scan-fullname">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
              <div class="scan-group-badge scan-group-badge-reject">${escapeHtml(student.group)}</div>
            </div>
          </div>
          <p class="muted">This ${escapeHtml(currentClassType)} session is for <strong>${escapeHtml(selectedGroup)}</strong> only.</p>
        </div>`;
      return;
    }
  }

  try {
    const res = await apiPost("addAttendance", {
      studentId,
      sessionType:  currentClassType,
      groupFilter:  selectedGroup
    });
    if (res.success) {
      const d = res.data;
      playSuccessSound();
      resultCard.innerHTML = `
        <div class="scan-result-success">
          <div class="scan-result-icon">✅</div>
          <h3>Attendance Recorded</h3>
          <div class="scan-identity">
            <div class="scan-avatar">${escapeHtml(getInitials(d.studentName))}</div>
            <div class="scan-identity-text">
              <div class="scan-fullname">${escapeHtml(d.studentName)}</div>
              <div class="scan-group-badge">${escapeHtml(d.studentGroup || "No Group")}</div>
            </div>
          </div>
          <p class="muted">${escapeHtml(d.sessionType)} · ${escapeHtml(d.courseName || "")} · ${escapeHtml(d.time)}</p>
        </div>`;
    } else if (res.code === "ALREADY_CHECKED_IN") {
      const d = res.data || {};
      playErrorSound();
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
      playErrorSound();
      resultCard.innerHTML = `
        <div class="scan-result-error">
          <div class="scan-result-icon">❌</div>
          <h3>Check-in Failed</h3>
          <p>${escapeHtml(res.message || "Unknown error")}</p>
        </div>`;
    }
    refreshAttendanceOnly();
  } catch (err) {
    playErrorSound();
    resultCard.innerHTML = `<div class="scan-result-error"><div class="scan-result-icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}


function getInitials(name) {
  if (!name) return "?";
  return String(name).trim().split(/\s+/).slice(0,2).map(p => p[0]?.toUpperCase()||"").join("");
}

function renderRecentAttendance() {
  const tbody = document.querySelector("#recentAttendanceTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const todayStr = formatDate(new Date());
  const groupMap = {};
  DB.students.forEach(s => groupMap[s.studentId] = s.group);
  const sessionIcons = { Theory: "🌅", TP1: "① TP1", TP2: "② TP2", TP3: "③ TP3" };

  DB.attendance.filter(a => a.date === todayStr)
    .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
    .forEach(a => {
      const tr = document.createElement("tr");
      const sessionLabel = sessionIcons[a.sessionType] || (a.sessionType || "–");
      tr.innerHTML = `
        <td>${escapeHtml(a.studentId)}</td>
        <td>${escapeHtml(a.studentName)}</td>
        <td>${escapeHtml(groupMap[a.studentId] || "")}</td>
        <td><span class="session-tag session-tag-${escapeAttr(a.sessionType || "Theory")}">${escapeHtml(sessionLabel)}</span></td>
        <td>${escapeHtml(a.date)}</td>
        <td>${escapeHtml((a.time || "").slice(0, 5))}</td>`;
      tbody.appendChild(tr);
    });
}

/* ===================== REPORTS ===================== */
function populateReportFilters() {
  const studentSel = document.getElementById("reportStudent");
  const groupSel   = document.getElementById("reportGroup");
  studentSel.innerHTML = '<option value="">All Students</option>' +
    DB.students.map(s => `<option value="${escapeAttr(s.studentId)}">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</option>`).join("");
  const groups = [...new Set(DB.students.map(s => s.group).filter(Boolean))];
  groupSel.innerHTML = '<option value="">All Groups</option>' + groups.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
}

/* ===================== ATTENDANCE MATRIX ===================== */
let lastMatrixData = null;

function runAttendanceMatrix() {
  const wrap = document.getElementById("matrixWrap");
  // Auto-use the single course
  const course = DB.courses[0] || null;
  if (!course) {
    wrap.innerHTML = '<p class="muted" style="padding:24px;text-align:center">No course found. Create a course first.</p>';
    return;
  }
  const allDays = getCourseDays(course);
  if (!allDays.length) {
    wrap.innerHTML = '<p class="muted" style="padding:24px;text-align:center">Course has no valid date range — check Start Date and End Date.</p>';
    return;
  }
  const todayStr = formatDate(new Date());
  const students  = DB.students;
  if (!students.length) {
    wrap.innerHTML = '<p class="muted" style="padding:24px;text-align:center">No students found.</p>';
    return;
  }

  // Build attendance lookup — normalize all dates, trim all IDs
  const attended = new Set();
  DB.attendance.forEach(a => {
    const recCourseId = String(a.courseId||"").trim();
    const selCourseId = String(course.courseId).trim();
    if (recCourseId !== selCourseId) return;
    const normalDate = normalizeDate(a.date);
    const sid = String(a.studentId||"").trim();
    if (sid && normalDate) attended.add(sid + "|" + normalDate);
  });

  // Header — icons only for day columns
  const shortDays = allDays.map(d => {
    const p = d.split("-");
    return p[2] + "/" + p[1];
  });

  let html = `<table class="data-table matrix-table"><thead><tr>
    <th class="matrix-name-col">Student</th>
    <th>Group</th>`;
  shortDays.forEach((label, i) => {
    const day = allDays[i];
    let cls = day < todayStr ? "matrix-hdr-past" : day === todayStr ? "matrix-hdr-today" : "matrix-hdr-future";
    // Icon only in header cell
    let icon = day < todayStr ? "📅" : day === todayStr ? "⭐" : "🔜";
    html += `<th class="matrix-day-hdr ${cls}" title="${day}">${icon}<br><span class="matrix-day-label">${label}</span></th>`;
  });
  html += `<th class="matrix-summary">✓</th><th class="matrix-summary">✗</th><th class="matrix-summary">%</th></tr></thead><tbody>`;

  students.forEach(s => {
    const sid = String(s.studentId||"").trim();
    const pastDays = allDays.filter(d => d < todayStr);
    let presentCount = 0, absentCount = 0;
    let row = `<tr>
      <td class="matrix-name-col">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}<br><span class="matrix-id-sub">${escapeHtml(s.studentId)}</span></td>
      <td>${escapeHtml(s.group)}</td>`;
    allDays.forEach(day => {
      const key = sid + "|" + day;
      const wasPresent = attended.has(key);
      if (day < todayStr) {
        if (wasPresent) { presentCount++; row += `<td title="${day} — Present"><span class="matrix-cell cell-present">✓</span></td>`; }
        else            { absentCount++;  row += `<td title="${day} — Absent"><span class="matrix-cell cell-absent">✗</span></td>`; }
      } else if (day === todayStr) {
        if (wasPresent) { presentCount++; row += `<td title="Today — Present"><span class="matrix-cell cell-present cell-today">✓</span></td>`; }
        else            {                 row += `<td title="Today"><span class="matrix-cell cell-future cell-today">·</span></td>`; }
      } else {
        row += `<td title="${day}"><span class="matrix-cell cell-future">–</span></td>`;
      }
    });
    const totalPast = pastDays.length;
    const rate      = totalPast > 0 ? Math.round((presentCount / totalPast) * 100) : 0;
    const rateCls   = rate >= 80 ? "rate-good" : rate >= 60 ? "rate-warn" : "rate-bad";
    row += `<td class="matrix-summary">${presentCount}</td><td class="matrix-summary">${absentCount}</td>`;
    row += `<td class="matrix-summary ${rateCls}">${totalPast > 0 ? rate+"%" : "–"}</td></tr>`;
    html += row;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
  lastMatrixData = { course, students, allDays, attended, todayStr };
}

function exportMatrixCSV() {
  if (!lastMatrixData) { showToast("Click Refresh first", true); return; }
  const { course, students, allDays, attended, todayStr } = lastMatrixData;
  const shortDays = allDays.map(d => { const p = d.split("-"); return p[2]+"/"+p[1]; });
  const header = ["StudentID","Name","Group",...shortDays,"Present","Absent","Rate%"];
  const lines  = [header.join(",")];
  students.forEach(s => {
    const row = [s.studentId, `${s.firstName} ${s.lastName}`, s.group];
    let present = 0, absent = 0;
    allDays.forEach(day => {
      const key = String(s.studentId).trim() + "|" + day;
      if (day < todayStr)       { if (attended.has(key)) { row.push("Present"); present++; } else { row.push("Absent"); absent++; } }
      else if (day === todayStr){ row.push(attended.has(key) ? "Present" : "Today"); if (attended.has(key)) present++; }
      else                      { row.push("Upcoming"); }
    });
    const total = allDays.filter(d => d < todayStr).length;
    const rate  = total > 0 ? Math.round((present/total)*100) : 0;
    row.push(present, absent, rate+"%");
    lines.push(row.map(csvEscape).join(","));
  });
  downloadFile(`attendance_matrix_${course.courseName.replace(/\s+/g,"_")}.csv`, lines.join("\n"), "text/csv");
}

let lastReportRows = [];
function runReport() {
  const studentId = document.getElementById("reportStudent").value;
  const group     = document.getElementById("reportGroup").value;
  let start = document.getElementById("reportStart").value;
  let end   = document.getElementById("reportEnd").value;
  const type = document.getElementById("reportType").value;
  const today = new Date();
  if (type === "daily")   { start = end = formatDate(today); }
  if (type === "weekly")  { const w = new Date(today); w.setDate(w.getDate()-7); start = formatDate(w); end = formatDate(today); }
  if (type === "monthly") { const m = new Date(today); m.setMonth(m.getMonth()-1); start = formatDate(m); end = formatDate(today); }

  const groupMap = {};
  DB.students.forEach(s => groupMap[s.studentId] = s.group);
  const rows = DB.attendance.filter(a => {
    if (studentId && a.studentId !== studentId) return false;
    if (group     && groupMap[a.studentId] !== group) return false;
    if (start     && a.date < start) return false;
    if (end       && a.date > end)   return false;
    return true;
  }).sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));

  lastReportRows = rows;
  const tbody = document.querySelector("#reportTable tbody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.time)}</td>
      <td>${escapeHtml(r.studentId)}</td>
      <td>${escapeHtml(r.studentName)}</td>
      <td>${escapeHtml(groupMap[r.studentId]||"")}</td>
    </tr>`).join("") || `<tr><td colspan="5" class="muted">No records found</td></tr>`;
}
function exportReportCSV() {
  if (!lastReportRows.length) { showToast("Run a report first", true); return; }
  const groupMap = {}; DB.students.forEach(s => groupMap[s.studentId] = s.group);
  const header = ["Date","Time","Student ID","Student Name","Group"];
  const lines  = [header.join(",")].concat(lastReportRows.map(r => [r.date, r.time, r.studentId, r.studentName, groupMap[r.studentId]||""].map(csvEscape).join(",")));
  downloadFile("attendance_report.csv", lines.join("\n"), "text/csv");
}
function exportReportExcel() {
  if (!lastReportRows.length) { showToast("Run a report first", true); return; }
  const groupMap = {}; DB.students.forEach(s => groupMap[s.studentId] = s.group);
  let html = "<table><tr><th>Date</th><th>Time</th><th>Student ID</th><th>Student Name</th><th>Group</th></tr>";
  lastReportRows.forEach(r => { html += `<tr><td>${r.date}</td><td>${r.time}</td><td>${r.studentId}</td><td>${r.studentName}</td><td>${groupMap[r.studentId]||""}</td></tr>`; });
  html += "</table>";
  downloadFile("attendance_report.xls", html, "application/vnd.ms-excel");
}

/* ===================== COURSE DAY HELPERS ===================== */
function normalizeDate(val) {
  if (!val) return "";
  if (val instanceof Date) return formatDate(val);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return formatDate(d);
  return s;
}
function getCourseDays(course) {
  if (!course || !course.startDate) return [];
  const startStr = normalizeDate(course.startDate);
  const endStr   = course.endDate ? normalizeDate(course.endDate) : null;
  if (!startStr || !endStr) return [];
  const days = [];
  let cur = new Date(startStr + "T00:00:00");
  const endDate = new Date(endStr + "T00:00:00");
  // Include every calendar day from start to end (no weekend filtering —
  // the course dates themselves define the schedule)
  while (cur <= endDate && days.length < 400) {
    days.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/* ===================== MODAL HELPERS ===================== */
function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
});

/* ===================== UTILS ===================== */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function csvEscape(val) {
  val = String(val ?? "");
  if (val.includes(",") || val.includes('"')) return '"' + val.replace(/"/g, '""') + '"';
  return val;
}
function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth()+1).padStart(2,"0");
  const dd   = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

// Null-safe element text setter — prevents "Cannot set properties of null" crashes
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setHtml(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val;
}
function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}
