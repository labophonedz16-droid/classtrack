/**
 * ===================================================================
 * QR ATTENDANCE SYSTEM — Google Apps Script Backend
 * ===================================================================
 * Deploy as a Web App:
 *   Deploy > New deployment > Type: Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Sheets required (auto-created on first run by ensureSheets()):
 *   - Students   : StudentID | FirstName | LastName | Email | Phone | Group | QRCodeURL | CreatedAt
 *   - Courses    : CourseID | CourseName | Subject | Group | Teacher | Duration | StartDate | EndDate | Status | CreatedAt
 *   - Attendance : AttendanceID | StudentID | StudentName | CourseID | CourseName | SessionType | GroupFilter | Date | Time | Timestamp
 * ===================================================================
 */

const SHEET_STUDENTS  = "Students";
const SHEET_COURSES   = "Courses";
const SHEET_ATTENDANCE = "Attendance";

// Cache key for the active course (short TTL — 5 minutes)
const CACHE_ACTIVE_COURSE_KEY = "activeCourse";
const CACHE_TTL = 300; // seconds

/* ===================== ENTRY POINTS ===================== */

function doGet(e) {
  ensureSheets();
  const action = e.parameter.action;
  try {
    let result;
    switch (action) {
      case "getStudents":   result = { success: true, data: getStudents() };   break;
      case "getCourses":    result = { success: true, data: getCourses() };    break;
      case "getAttendance": result = { success: true, data: getAttendance() }; break;
      default: result = { success: false, message: "Unknown action: " + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

function doPost(e) {
  ensureSheets();
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    const payload = body.payload || {};
    let result;
    switch (action) {
      case "addStudent":    result = addStudent(payload);    break;
      case "updateStudent": result = updateStudent(payload); break;
      case "deleteStudent": result = deleteStudent(payload); break;

      case "addCourse":    result = addCourse(payload);    break;
      case "updateCourse": result = updateCourse(payload); break;
      case "deleteCourse": result = deleteCourse(payload); break;

      case "addAttendance": result = addAttendance(payload); break;

      default: result = { success: false, message: "Unknown action: " + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== SHEET SETUP ===================== */

function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_STUDENTS)) {
    ss.insertSheet(SHEET_STUDENTS)
      .appendRow(["StudentID","FirstName","LastName","Email","Phone","Group","QRCodeURL","CreatedAt"]);
  }
  if (!ss.getSheetByName(SHEET_COURSES)) {
    ss.insertSheet(SHEET_COURSES)
      .appendRow(["CourseID","CourseName","Subject","Group","Teacher","Duration","StartDate","EndDate","Status","CreatedAt"]);
  }
  if (!ss.getSheetByName(SHEET_ATTENDANCE)) {
    ss.insertSheet(SHEET_ATTENDANCE)
      .appendRow(["AttendanceID","StudentID","StudentName","CourseID","CourseName","SessionType","GroupFilter","Date","Time","Timestamp"]);
  }
}

/* ===================== HELPERS ===================== */

// Cache the spreadsheet reference for the duration of a single script execution.
// SpreadsheetApp.getActiveSpreadsheet() is a Sheets API call — calling it repeatedly
// in one execution wastes quota and adds latency.
let _ss = null;
function getSS() {
  if (!_ss) _ss = SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}

function getSheet(name) {
  return getSS().getSheetByName(name);
}

function sheetToObjects(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(c => c === "")) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[camelCase(h)] = formatCell(row[idx]));
    out.push(obj);
  }
  return out;
}

function formatCell(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return val;
}

function camelCase(header) {
  const map = {
    "StudentID": "studentId", "FirstName": "firstName", "LastName": "lastName",
    "Email": "email", "Phone": "phone", "Group": "group", "QRCodeURL": "qrCodeUrl", "CreatedAt": "createdAt",
    "CourseID": "courseId", "CourseName": "courseName", "Subject": "subject",
    "Teacher": "teacher", "Duration": "duration", "StartDate": "startDate", "EndDate": "endDate", "Status": "status",
    "AttendanceID": "attendanceId", "Date": "date", "Time": "time", "Timestamp": "timestamp",
    "StudentName": "studentName", "SessionType": "sessionType", "GroupFilter": "groupFilter"
  };
  return map[header] || header;
}

// Single full read of a sheet — returns { headers, data } where data is raw 2D array (no header row).
// This avoids the pattern of reading the sheet once in findRowIndex and again elsewhere.
function readSheet(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 1) return { headers: [], data: [] };
  return { headers: rows[0], data: rows.slice(1) };
}

// Find the 0-based index inside `data` (not the sheet row number) where data[i][colIdx] === value.
function findInData(data, colIdx, value) {
  const target = String(value);
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][colIdx]) === target) return i;
  }
  return -1;
}

function generateQrUrl(studentId) {
  const payload = encodeURIComponent(JSON.stringify({ studentId: studentId }));
  return "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + payload;
}

/* ===================== STUDENTS ===================== */

function getStudents() {
  return sheetToObjects(getSheet(SHEET_STUDENTS));
}

function addStudent(p) {
  if (!p.studentId) return { success: false, message: "Student ID is required" };
  const sheet = getSheet(SHEET_STUDENTS);
  const { data } = readSheet(sheet);
  if (findInData(data, 0, p.studentId) !== -1) {
    return { success: false, message: "Student ID already exists" };
  }
  const qrUrl = generateQrUrl(p.studentId);
  sheet.appendRow([p.studentId, p.firstName||"", p.lastName||"", p.email||"", p.phone||"", p.group||"", qrUrl, new Date()]);
  return { success: true, data: { studentId: p.studentId, qrCodeUrl: qrUrl } };
}

function updateStudent(p) {
  const sheet = getSheet(SHEET_STUDENTS);
  const { data } = readSheet(sheet);
  const idx = findInData(data, 0, p.studentId);
  if (idx === -1) return { success: false, message: "Student not found" };
  // Sheet row = idx + 2 (1-based, +1 for header)
  sheet.getRange(idx + 2, 2, 1, 5).setValues([[p.firstName||"", p.lastName||"", p.email||"", p.phone||"", p.group||""]]);
  return { success: true };
}

function deleteStudent(p) {
  const sheet = getSheet(SHEET_STUDENTS);
  const { data } = readSheet(sheet);
  const idx = findInData(data, 0, p.studentId);
  if (idx === -1) return { success: false, message: "Student not found" };
  sheet.deleteRow(idx + 2);
  return { success: true };
}

/* ===================== COURSES ===================== */

function getCourses() {
  return sheetToObjects(getSheet(SHEET_COURSES));
}

function addCourse(p) {
  const sheet = getSheet(SHEET_COURSES);
  const courseId = p.courseId || ("CRS" + new Date().getTime());
  sheet.appendRow([courseId, p.courseName||"", p.subject||"", p.group||"", p.teacher||"",
    p.duration||"", p.startDate||"", p.endDate||"", p.status||"Draft", new Date()]);
  // Invalidate active course cache whenever courses change
  invalidateActiveCourseCache();
  return { success: true, data: { courseId } };
}

function updateCourse(p) {
  const sheet = getSheet(SHEET_COURSES);
  const { data } = readSheet(sheet);
  const idx = findInData(data, 0, p.courseId);
  if (idx === -1) return { success: false, message: "Course not found" };
  sheet.getRange(idx + 2, 2, 1, 8).setValues([[
    p.courseName||"", p.subject||"", p.group||"", p.teacher||"",
    p.duration||"", p.startDate||"", p.endDate||"", p.status||"Draft"
  ]]);
  invalidateActiveCourseCache();
  return { success: true };
}

function deleteCourse(p) {
  const sheet = getSheet(SHEET_COURSES);
  const { data } = readSheet(sheet);
  const idx = findInData(data, 0, p.courseId);
  if (idx === -1) return { success: false, message: "Course not found" };
  sheet.deleteRow(idx + 2);
  invalidateActiveCourseCache();
  return { success: true };
}

/* ===================== ACTIVE COURSE CACHE ===================== */
// The active course is looked up on every scan. Caching it in CacheService
// avoids a full Courses sheet read on every attendance record.

function getActiveCourse() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_ACTIVE_COURSE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }
  const courses = getCourses();
  const active = courses.find(c => c.status === "Ongoing") || null;
  // Cache for CACHE_TTL seconds (null is also cached to avoid repeated misses)
  cache.put(CACHE_ACTIVE_COURSE_KEY, JSON.stringify(active), CACHE_TTL);
  return active;
}

function invalidateActiveCourseCache() {
  CacheService.getScriptCache().remove(CACHE_ACTIVE_COURSE_KEY);
}

/* ===================== ATTENDANCE ===================== */

function getAttendance() {
  return sheetToObjects(getSheet(SHEET_ATTENDANCE));
}

function addAttendance(p) {
  const studentsSheet   = getSheet(SHEET_STUDENTS);
  const attendanceSheet = getSheet(SHEET_ATTENDANCE);

  // --- 1. Validate student ---
  const { data: studentsData } = readSheet(studentsSheet);
  const sIdx = findInData(studentsData, 0, p.studentId);
  if (sIdx === -1) {
    return { success: false, message: "Student not found: " + p.studentId };
  }
  const sr = studentsData[sIdx];
  const studentName  = (String(sr[1]) + " " + String(sr[2])).trim();
  const studentGroup = String(sr[5] || "");

  // --- 2. Session info ---
  const sessionType = p.sessionType || "Theory";
  const groupFilter = p.groupFilter || "";

  // --- 3. Get active course (cached) ---
  const activeCourse = getActiveCourse();
  if (!activeCourse) {
    return { success: false, message: "No active (Ongoing) course found" };
  }

  const now      = new Date();
  const tz       = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const timeStr  = Utilities.formatDate(now, tz, "HH:mm:ss");

  // --- 4. Duplicate check: same student + same sessionType + same date ---
  // Columns: [0]AttendanceID [1]StudentID [2]StudentName [3]CourseID [4]CourseName [5]SessionType [6]GroupFilter [7]Date [8]Time [9]Timestamp
  const { data: attData } = readSheet(attendanceSheet);
  for (let i = 0; i < attData.length; i++) {
    const row = attData[i];
    const rowStudentId   = String(row[1]);
    const rowSessionType = String(row[5] || "Theory");
    const rowDate        = formatCell(row[7]);
    if (rowStudentId === String(p.studentId) && rowSessionType === sessionType && rowDate === todayStr) {
      return {
        success: false,
        code: "ALREADY_CHECKED_IN",
        message: "Already checked in for " + sessionType + " today at " + String(row[8]),
        data: { studentId: p.studentId, studentName, studentGroup }
      };
    }
  }

  // --- 5. Write ---
  const attendanceId = "ATT" + now.getTime();
  attendanceSheet.appendRow([
    attendanceId, p.studentId, studentName,
    activeCourse.courseId, activeCourse.courseName,
    sessionType, groupFilter,
    todayStr, timeStr, now.toISOString()
  ]);

  return {
    success: true,
    data: {
      attendanceId, studentId: p.studentId, studentName, studentGroup,
      courseId: activeCourse.courseId, courseName: activeCourse.courseName,
      sessionType, date: todayStr, time: timeStr
    }
  };
}

/* ===================== RESET DATABASE ===================== */
// Clears ALL data rows (keeps headers) from Students, Courses, Attendance.
// Used when starting a brand new course cohort.
function resetDatabase() {
  try {
    [SHEET_STUDENTS, SHEET_COURSES, SHEET_ATTENDANCE].forEach(name => {
      const sheet = getSheet(name);
      if (!sheet) return;
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    });
    invalidateActiveCourseCache();
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}
