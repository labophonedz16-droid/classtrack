/**
 * ===================================================================
 * QR ATTENDANCE SYSTEM — Google Apps Script Backend
 * ===================================================================
 * Deploy as a Web App:
 *   Deploy > New deployment > Type: Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Sheets required in the bound Google Sheet (created automatically
 * on first run by ensureSheets()):
 *   - Students   : StudentID | FirstName | LastName | Email | Phone | Group | QRCodeURL | CreatedAt
 *   - Courses    : CourseID | CourseName | Subject | Group | Teacher | Duration | StartDate | EndDate | Status | CreatedAt
 *   - Attendance : AttendanceID | StudentID | StudentName | CourseID | CourseName | Date | Time | Timestamp
 * ===================================================================
 */

const SHEET_STUDENTS = "Students";
const SHEET_COURSES = "Courses";
const SHEET_ATTENDANCE = "Attendance";

/* ===================== ENTRY POINTS ===================== */

function doGet(e) {
  ensureSheets();
  const action = e.parameter.action;
  try {
    let result;
    switch (action) {
      case "getStudents": result = { success: true, data: getStudents() }; break;
      case "getCourses": result = { success: true, data: getCourses() }; break;
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
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};
    let result;
    switch (action) {
      case "addStudent": result = addStudent(payload); break;
      case "updateStudent": result = updateStudent(payload); break;
      case "deleteStudent": result = deleteStudent(payload); break;

      case "addCourse": result = addCourse(payload); break;
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
    const sh = ss.insertSheet(SHEET_STUDENTS);
    sh.appendRow(["StudentID", "FirstName", "LastName", "Email", "Phone", "Group", "QRCodeURL", "CreatedAt"]);
  }
  if (!ss.getSheetByName(SHEET_COURSES)) {
    const sh = ss.insertSheet(SHEET_COURSES);
    sh.appendRow(["CourseID", "CourseName", "Subject", "Group", "Teacher", "Duration", "StartDate", "EndDate", "Status", "CreatedAt"]);
  }
  if (!ss.getSheetByName(SHEET_ATTENDANCE)) {
    const sh = ss.insertSheet(SHEET_ATTENDANCE);
    sh.appendRow(["AttendanceID", "StudentID", "StudentName", "CourseID", "CourseName", "Date", "Time", "Timestamp"]);
  }
}

/* ===================== HELPERS ===================== */

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
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
    "AttendanceID": "attendanceId", "Date": "date", "Time": "time", "Timestamp": "timestamp"
  };
  return map[header] || header;
}

function findRowIndexByValue(sheet, columnIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][columnIndex]) === String(value)) return i + 1; // 1-indexed row
  }
  return -1;
}

function generateQrUrl(studentId) {
  // Uses a public QR generator API as a fallback image URL (frontend also renders local QR)
  const payload = encodeURIComponent(JSON.stringify({ studentId: studentId }));
  return "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + payload;
}

/* ===================== STUDENTS ===================== */

function getStudents() {
  return sheetToObjects(getSheet(SHEET_STUDENTS));
}

function addStudent(p) {
  const sheet = getSheet(SHEET_STUDENTS);
  if (!p.studentId) return { success: false, message: "Student ID is required" };
  if (findRowIndexByValue(sheet, 0, p.studentId) !== -1) {
    return { success: false, message: "Student ID already exists" };
  }
  const qrUrl = generateQrUrl(p.studentId);
  sheet.appendRow([
    p.studentId, p.firstName || "", p.lastName || "", p.email || "",
    p.phone || "", p.group || "", qrUrl, new Date()
  ]);
  return { success: true, data: { studentId: p.studentId, qrCodeUrl: qrUrl } };
}

function updateStudent(p) {
  const sheet = getSheet(SHEET_STUDENTS);
  const row = findRowIndexByValue(sheet, 0, p.studentId);
  if (row === -1) return { success: false, message: "Student not found" };
  sheet.getRange(row, 2, 1, 5).setValues([[p.firstName || "", p.lastName || "", p.email || "", p.phone || "", p.group || ""]]);
  return { success: true };
}

function deleteStudent(p) {
  const sheet = getSheet(SHEET_STUDENTS);
  const row = findRowIndexByValue(sheet, 0, p.studentId);
  if (row === -1) return { success: false, message: "Student not found" };
  sheet.deleteRow(row);
  return { success: true };
}

/* ===================== COURSES ===================== */

function getCourses() {
  return sheetToObjects(getSheet(SHEET_COURSES));
}

function addCourse(p) {
  const sheet = getSheet(SHEET_COURSES);
  const courseId = p.courseId || ("CRS" + new Date().getTime());
  sheet.appendRow([
    courseId, p.courseName || "", p.subject || "", p.group || "", p.teacher || "",
    p.duration || "", p.startDate || "", p.endDate || "", p.status || "Draft", new Date()
  ]);
  return { success: true, data: { courseId: courseId } };
}

function updateCourse(p) {
  const sheet = getSheet(SHEET_COURSES);
  const row = findRowIndexByValue(sheet, 0, p.courseId);
  if (row === -1) return { success: false, message: "Course not found" };
  sheet.getRange(row, 2, 1, 8).setValues([[
    p.courseName || "", p.subject || "", p.group || "", p.teacher || "",
    p.duration || "", p.startDate || "", p.endDate || "", p.status || "Draft"
  ]]);
  return { success: true };
}

function deleteCourse(p) {
  const sheet = getSheet(SHEET_COURSES);
  const row = findRowIndexByValue(sheet, 0, p.courseId);
  if (row === -1) return { success: false, message: "Course not found" };
  sheet.deleteRow(row);
  return { success: true };
}

/* ===================== ATTENDANCE ===================== */

function getAttendance() {
  return sheetToObjects(getSheet(SHEET_ATTENDANCE));
}

function getActiveCourse() {
  const courses = getCourses();
  return courses.find(c => c.status === "Ongoing") || null;
}

function addAttendance(p) {
  const studentsSheet = getSheet(SHEET_STUDENTS);
  const attendanceSheet = getSheet(SHEET_ATTENDANCE);

  const studentRow = findRowIndexByValue(studentsSheet, 0, p.studentId);
  if (studentRow === -1) {
    return { success: false, message: "Student not found: " + p.studentId };
  }
  const studentData = studentsSheet.getRange(studentRow, 1, 1, 6).getValues()[0];
  const studentName = (studentData[1] + " " + studentData[2]).trim();
  const studentGroup = studentData[5] || "";

  const activeCourse = getActiveCourse();
  if (!activeCourse) {
    return { success: false, message: "No active (Ongoing) course found" };
  }

  const now = new Date();
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");

  // check duplicate attendance for same student/same day
  const allAttendance = attendanceSheet.getDataRange().getValues();
  for (let i = 1; i < allAttendance.length; i++) {
    const row = allAttendance[i];
    if (String(row[1]) === String(p.studentId) && formatCell(row[5]) === todayStr) {
      return {
        success: false,
        code: "ALREADY_CHECKED_IN",
        message: "Already Checked In today at " + row[6],
        data: { studentId: p.studentId, studentName, studentGroup }
      };
    }
  }

  const attendanceId = "ATT" + now.getTime();
  attendanceSheet.appendRow([
    attendanceId, p.studentId, studentName, activeCourse.courseId, activeCourse.courseName,
    todayStr, timeStr, now.toISOString()
  ]);

  return {
    success: true,
    data: {
      attendanceId, studentId: p.studentId, studentName, studentGroup,
      courseId: activeCourse.courseId, courseName: activeCourse.courseName,
      date: todayStr, time: timeStr
    }
  };
}
