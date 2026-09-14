import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  INITIAL_STUDENTS,
  INITIAL_ATTENDANCE,
  INITIAL_SESSIONS,
  INITIAL_DEVICES,
  INITIAL_SUBJECTS,
  INITIAL_STAFF,
  INITIAL_ACTIVITY_LOGS,
  DEFAULT_SETTINGS
} from './src/data/mockData';
import { Student, AttendanceRecord, ClassSession, Device, Subject, StaffUser, ActivityLog, SystemSettings } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // In-memory data stores
  let students: Student[] = [...INITIAL_STUDENTS];
  let attendanceRecords: AttendanceRecord[] = [...INITIAL_ATTENDANCE];
  let sessions: ClassSession[] = [...INITIAL_SESSIONS];
  let devices: Device[] = [...INITIAL_DEVICES];
  let subjects: Subject[] = [...INITIAL_SUBJECTS];
  let staff: StaffUser[] = [...INITIAL_STAFF];
  let activityLogs: ActivityLog[] = [...INITIAL_ACTIVITY_LOGS];
  let settings: SystemSettings = { ...DEFAULT_SETTINGS };

  // Helper for logging
  const logActivity = (type: string, message: string) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const newLog: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timeStr,
      type,
      message
    };
    activityLogs = [newLog, ...activityLogs.slice(0, 49)];
    return newLog;
  };

  // ----------------------------------------------------
  // API Routes
  // ----------------------------------------------------

  // Health
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Students
  app.get('/api/students', (req: Request, res: Response) => {
    res.json({ success: true, count: students.length, data: students });
  });

  app.get('/api/students/:id', (req: Request, res: Response) => {
    const student = students.find(s => s.id === req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, data: student });
  });

  app.post('/api/students', (req: Request, res: Response) => {
    const body = req.body;
    const newStudent: Student = {
      id: `stud_${Date.now()}`,
      name: body.name || 'New Student',
      rollNo: body.rollNo || `23CS${Math.floor(100 + Math.random() * 900)}`,
      registerNo: body.registerNo || `310623104${Math.floor(100 + Math.random() * 900)}`,
      branch: body.branch || 'Computer Science & Engineering',
      degree: body.degree || 'B.Tech',
      yearOfStudy: Number(body.yearOfStudy) || 3,
      section: body.section || 'A',
      nfcUid: body.nfcUid || '',
      faceId: body.faceId || `FACE_EMB_${body.rollNo || Date.now()}`,
      email: body.email || '',
      phone: body.phone || '',
      profilePhoto: body.profilePhoto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      status: body.status || 'Active',
      faceSamplesCount: body.faceSamplesCount || (body.faceEmbedding ? 4 : 0),
      registeredAt: new Date().toISOString().split('T')[0]
    };
    students = [newStudent, ...students];
    logActivity('ENROLLMENT', `Student ${newStudent.name} (${newStudent.rollNo}) registered.`);
    res.status(201).json({ success: true, data: newStudent });
  });

  app.put('/api/students/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const idx = students.findIndex(s => s.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    students[idx] = { ...students[idx], ...req.body };
    res.json({ success: true, data: students[idx] });
  });

  app.delete('/api/students/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const student = students.find(s => s.id === id);
    students = students.filter(s => s.id !== id);
    if (student) {
      logActivity('ENROLLMENT', `Student record for ${student.name} (${student.rollNo}) deleted.`);
    }
    res.json({ success: true, message: 'Student deleted successfully' });
  });

  // Attendance
  app.get('/api/attendance', (req: Request, res: Response) => {
    res.json({ success: true, count: attendanceRecords.length, data: attendanceRecords });
  });

  // Dual-factor attendance verification
  app.post('/api/attendance/verify', (req: Request, res: Response) => {
    const { nfc_uid, matched_student_id, face_confidence, liveness_score, device_id } = req.body;

    const activeSession = sessions.find(s => s.isActive);
    if (!activeSession) {
      return res.status(400).json({
        success: false,
        message: 'No active session is currently running. Start or toggle session to LIVE first.'
      });
    }

    const student = students.find(s => s.id === matched_student_id || (nfc_uid && s.nfcUid === nfc_uid));
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found in university directory.'
      });
    }

    // Verify NFC card matches face-matched student if NFC is passed
    if (nfc_uid && student.nfcUid && student.nfcUid.toUpperCase() !== nfc_uid.toUpperCase()) {
      logActivity('SECURITY_ALERT', `Identity mismatch: NFC card [${nfc_uid}] does not belong to ${student.name} (${student.rollNo})!`);
      return res.status(400).json({
        success: false,
        message: `Biometric mismatch: Card [${nfc_uid}] is registered to a different student. Dual-factor authorization rejected.`
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const nowTimeStr = new Date().toTimeString().split(' ')[0];

    // Check duplicate in current session or same date/subject
    const existing = attendanceRecords.find(
      r => r.studentId === student.id && (r.sessionId === activeSession.id || (r.date === today && r.subject === activeSession.subjectName))
    );

    if (existing) {
      logActivity('ATTENDANCE_VERIFIED', `Duplicate scan ignored for ${student.name} (${student.rollNo}) at ${nowTimeStr}. Prior entry: ${existing.entryTime}`);
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: `Student was already marked at ${existing.entryTime}. Duplicate tap prevented.`,
        entryTime: existing.entryTime
      });
    }

    // Calculate Status (PRESENT vs LATE)
    let status: 'PRESENT' | 'LATE' = 'PRESENT';
    if (activeSession.lateThreshold) {
      const [curH, curM] = nowTimeStr.split(':').map(Number);
      const [thH, thM] = activeSession.lateThreshold.split(':').map(Number);
      if (curH > thH || (curH === thH && curM > thM)) {
        status = 'LATE';
      }
    }

    const newRecord: AttendanceRecord = {
      id: `att_${Date.now()}`,
      date: today,
      time: nowTimeStr,
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      registerNo: student.registerNo,
      branch: student.branch,
      degree: student.degree,
      yearOfStudy: student.yearOfStudy,
      section: student.section,
      subject: activeSession.subjectName,
      faculty: activeSession.facultyName,
      classroom: activeSession.classroomName,
      nfcUid: nfc_uid || student.nfcUid || 'MANUAL_SCAN',
      faceConfidence: Number(face_confidence) || 98.6,
      entryTime: nowTimeStr,
      status,
      verificationMethod: nfc_uid ? 'NFC + Face Recognition' : 'AI Face Recognition',
      deviceId: device_id || 'ESP32_CLASSROOM_01',
      sessionId: activeSession.id,
      livenessScore: Number(liveness_score) || 0.95
    };

    attendanceRecords = [newRecord, ...attendanceRecords];

    // Update device stats
    const dev = devices.find(d => d.id === (device_id || 'ESP32_CLASSROOM_01'));
    if (dev) {
      dev.lastCommunication = new Date().toISOString();
      dev.lastDetectedUid = newRecord.nfcUid;
    }

    logActivity('ATTENDANCE_VERIFIED', `${student.name} (${student.rollNo}) verified via ${newRecord.verificationMethod} with status ${status}.`);

    return res.status(201).json({
      success: true,
      attendance: newRecord
    });
  });

  // Direct NFC tap endpoint
  app.post('/api/attendance/nfc', (req: Request, res: Response) => {
    const { nfc_uid, device_id } = req.body;
    const student = students.find(s => s.nfcUid && s.nfcUid.toUpperCase() === (nfc_uid || '').toUpperCase());
    if (!student) {
      return res.status(404).json({ success: false, message: `No student is paired with NFC card [${nfc_uid}].` });
    }
    res.json({ success: true, student, message: `NFC Card [${nfc_uid}] belongs to ${student.name} (${student.rollNo}).` });
  });

  // Sessions
  app.get('/api/sessions', (req: Request, res: Response) => {
    res.json({ success: true, count: sessions.length, data: sessions });
  });

  app.get('/api/sessions/active', (req: Request, res: Response) => {
    const active = sessions.find(s => s.isActive) || null;
    res.json({ success: true, data: active });
  });

  app.post('/api/sessions', (req: Request, res: Response) => {
    const body = req.body;
    if (body.isActive) {
      sessions.forEach(s => s.isActive = false);
    }
    const newSession: ClassSession = {
      id: `sess_${Date.now()}`,
      subjectId: body.subjectId || 'sub_1',
      subjectName: body.subjectName || 'Computer Vision & Deep Learning',
      subjectCode: body.subjectCode || 'CS501',
      facultyId: body.facultyId || 'fac_1',
      facultyName: body.facultyName || 'Prof. Marcus Brody',
      classroomId: body.classroomId || 'cr_101',
      classroomName: body.classroomName || 'Smart Classroom 402',
      date: body.date || new Date().toISOString().split('T')[0],
      startTime: body.startTime || '09:00',
      closingTime: body.closingTime || '10:00',
      lateThreshold: body.lateThreshold || '09:10',
      academicYear: body.academicYear || '2026-2027',
      semester: body.semester || 'Semester 5',
      isActive: body.isActive ?? true
    };
    sessions = [newSession, ...sessions];
    logActivity('SESSION_TOGGLE', `New class session "${newSession.subjectName}" created.`);
    res.status(201).json({ success: true, data: newSession });
  });

  app.put('/api/sessions/:id/toggle', (req: Request, res: Response) => {
    const session = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    const targetState = !session.isActive;
    if (targetState) {
      sessions.forEach(s => s.isActive = false);
    }
    session.isActive = targetState;
    logActivity('SESSION_TOGGLE', `Session "${session.subjectName}" is now ${session.isActive ? 'ACTIVE (LIVE)' : 'INACTIVE'}.`);
    res.json({ success: true, data: session });
  });

  // Devices (ESP32 IoT)
  app.get('/api/devices', (req: Request, res: Response) => {
    res.json({ success: true, data: devices });
  });

  app.post('/api/devices/ping', (req: Request, res: Response) => {
    const dev = devices[0];
    if (dev) {
      dev.lastCommunication = new Date().toISOString();
    }
    res.json({ success: true, message: 'Pong', timestamp: new Date().toISOString() });
  });

  // Subjects
  app.get('/api/subjects', (req: Request, res: Response) => {
    res.json({ success: true, data: subjects });
  });

  // Activity Logs
  app.get('/api/activity-logs', (req: Request, res: Response) => {
    res.json({ success: true, data: activityLogs });
  });

  // Staff & Admin Directory
  app.get('/api/staff', (req: Request, res: Response) => {
    res.json({ success: true, data: staff });
  });

  app.post('/api/staff', (req: Request, res: Response) => {
    const body = req.body;
    const newStaff: StaffUser = {
      id: `usr_${Date.now()}`,
      uidNum: body.uidNum || `UID-STF-${Math.floor(2000 + Math.random() * 900)}`,
      username: body.username || (body.name || '').toLowerCase().replace(/\s+/g, '.'),
      name: body.name || 'New Staff Member',
      role: body.role || 'faculty',
      designation: body.designation || 'Faculty Member',
      department: body.department || 'Computer Science & Engineering',
      staffId: body.staffId || `STF-${Math.floor(100 + Math.random() * 900)}`,
      email: body.email || '',
      phone: body.phone || '+91 98400 00000',
      lastLogin: new Date().toISOString()
    };
    staff = [newStaff, ...staff];
    logActivity('ENROLLMENT', `Staff/Admin account for ${newStaff.name} (${newStaff.uidNum}) registered.`);
    res.status(201).json({ success: true, data: newStaff });
  });

  // Auth Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { uidNum, password } = req.body;
    if (!uidNum || !password) {
      return res.status(400).json({ success: false, message: 'UID Number and Password are required.' });
    }

    const cleanUid = uidNum.trim();
    // Match staff/admin
    const user = staff.find(u =>
      u.uidNum.toLowerCase() === cleanUid.toLowerCase() ||
      u.username.toLowerCase() === cleanUid.toLowerCase() ||
      u.staffId.toLowerCase() === cleanUid.toLowerCase()
    );

    if (user) {
      user.lastLogin = new Date().toISOString();
      logActivity('USER_LOGIN', `${user.name} (${user.uidNum}) logged in successfully as ${user.role.toUpperCase()}.`);
      return res.json({
        success: true,
        user,
        message: `Welcome back, ${user.name}!`
      });
    }

    // Match student
    const stud = students.find(s =>
      s.rollNo.toLowerCase() === cleanUid.toLowerCase() ||
      s.registerNo.toLowerCase() === cleanUid.toLowerCase() ||
      s.nfcUid.toLowerCase() === cleanUid.toLowerCase()
    );

    if (stud) {
      const studentUser: StaffUser = {
        id: `usr_stu_${stud.id}`,
        uidNum: stud.rollNo,
        username: stud.rollNo.toLowerCase(),
        name: stud.name,
        role: 'student',
        designation: 'Undergraduate Student',
        department: stud.branch,
        staffId: stud.rollNo,
        email: stud.email,
        phone: stud.phone,
        lastLogin: new Date().toISOString(),
        studentId: stud.id
      };
      logActivity('USER_LOGIN', `Student ${stud.name} (${stud.rollNo}) logged in to student attendance portal.`);
      return res.json({
        success: true,
        user: studentUser,
        message: `Welcome to Student Portal, ${stud.name}!`
      });
    }

    // Support standard demo login
    if (cleanUid === 'admin' || cleanUid === 'ADM-1001' || cleanUid === 'ADM-1007') {
      const defaultAdmin = staff[0];
      return res.json({ success: true, user: defaultAdmin, message: `Welcome back, ${defaultAdmin.name}!` });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials. Please verify your UID Number and Password.'
    });
  });

  // Settings
  app.get('/api/settings', (req: Request, res: Response) => {
    res.json({ success: true, data: settings });
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    settings = { ...settings, ...req.body };
    logActivity('SETTINGS_UPDATE', 'System biometric thresholds and network policies updated.');
    res.json({ success: true, data: settings, message: 'Settings saved successfully' });
  });

  // This backend is now a pure API server.
  // It does NOT serve the frontend website — the frontend
  // runs separately (see ../frontend) and talks to this
  // server only through /api/... requests.

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Smart Attendance Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
