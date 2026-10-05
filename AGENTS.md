# Project: ระบบสอบออนไลน์ รร.มัธยม

## Stack (ห้ามเปลี่ยนโดยไม่ถาม)
- Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- Firebase Spark plan (ฟรี): Auth + Firestore เท่านั้น
- Server logic: Next.js API Routes + firebase-admin
- Validation: Zod | Test: Vitest (rules test ใช้ Emulator เฉพาะตอนทดสอบ rules)
- Deploy: Vercel Hobby

## ข้อห้ามเด็ดขาด
- ห้ามใช้ Cloud Functions, Firebase Storage, Realtime Database
- ห้ามติดตั้ง package ใหม่โดยไม่บอกเหตุผลก่อน
- ห้ามส่งเฉลย (isCorrect, examKeys) ไป client ในทุกกรณี
- ห้ามใช้ onSnapshot ในหน้าสอบและหน้ารายงาน ใช้ getDoc/getDocs ครั้งเดียว
- ห้ามเชื่อเวลาจาก client ใช้ server Timestamp เท่านั้น
- ห้าม hardcode secret ใช้ .env.local และห้าม commit
- ห้ามแก้ไฟล์ firestore.rules โดยไม่รัน rules test

## Data model (Firestore)
users/{uid}: name, email, role[ADMIN|TEACHER|STUDENT], classroomId
classrooms/{id}, subjects/{id}
questions/{id}: ownerId, subjectId, type, body, points, choices[{id,text,isCorrect}], explanation
exams/{id}: ownerId, title, durationMin, openAt, closeAt, shuffleQuestions, shuffleChoices, showResult, status, classroomIds[]
examPapers/{examId}: questions[{id,type,body,points,choices[{id,text}]}]   ← ไม่มีเฉลย
examKeys/{examId}: answers{qid: {type, points, correct: choiceId | acceptedTexts[] | null}}                ← Admin SDK เท่านั้น
attemptEvents/{attemptId}: examId, examOwnerId, studentId, events[{type:'AWAY', via, durationMs, reportedAtMs}], truncated, lastReportMs   ← Admin SDK เท่านั้น (Rules ไม่มี match = ปฏิเสธ)
attempts/{examId}_{studentUid}: examId, examOwnerId, studentId, studentName, classroomId, showResult, startedAt, deadlineAt, submittedAt, order[], choiceOrder{}, answers{qid:value}, score, manualScores{}, status, integrity{awayCount, awayTotalMs}

## กฎประหยัด Firestore quota
- รวมข้อมูลที่อัปเดตพร้อมกันไว้ในเอกสารเดียว (map)
- อัปเดตด้วย updateDoc + field path เช่น `answers.${qid}` ห้ามเขียนทับทั้งเอกสาร
- Autosave: เก็บ localStorage ทันที แล้ว flush เมื่อเปลี่ยนข้อ หรือทุก 30 วินาทีถ้ามีการเปลี่ยนแปลง
- หน้ารายงานใช้ query เดียว ห้ามวนอ่านทีละเอกสาร ห้าม polling

## Security
- ทุก API route: verify ID token → ตรวจ role (Custom Claims) → ตรวจความเป็นเจ้าของ → Zod validate
- role และ classroomId (นักเรียน) เก็บใน Custom Claims อ่านผ่าน `request.auth.token` ใน Rules (ห้ามใช้ get() อ่าน users) ถ้าย้ายห้อง ต้องอัปเดต claim ด้วย Admin SDK
- attempt id = `{examId}_{studentUid}` เสมอ (Rules ใช้ exists() ตรวจก่อนให้อ่าน examPapers และกันสอบซ้ำ)
- attempts ต้องมี examOwnerId (สร้างโดย start API) เพื่อให้ครูเห็นเฉพาะข้อสอบของตัวเอง
- ครูแก้ exams จาก client ได้เฉพาะ status DRAFT; publish/close ทำผ่าน API เท่านั้น
- Publish/close exam ผ่าน API เท่านั้น (src/app/api/exams/[id]/publish|close) logic แยกที่ src/lib/publish.ts (pure + test)
- เริ่มสอบ/ส่งสอบผ่าน API (src/app/api/exams/[id]/start, attempts/[id]/submit) logic แยกที่ src/lib/exam-session.ts และ grading.ts (pure + test)
- ลำดับข้อ/ตัวเลือกสุ่มด้วย seed = attemptId เก็บใน attempt (refresh แล้วลำดับเดิม)
- คะแนนอยู่ใน attemptResults/{attemptId} (Admin SDK เขียนเท่านั้น) ห้ามเก็บ score ใน attempts; นักเรียนอ่านได้เมื่อ showResult=true และ status=GRADED
- ตรวจอัตนัยผ่าน API /api/attempts/[id]/grade; ตรวจ attempt ที่หมดเวลาแต่ไม่ส่งแบบ lazy ผ่าน /api/exams/[id]/finalize (เรียกตอนครูเปิดรายงาน)
- จัดการผู้ใช้ทั้งหมดผ่าน API /api/admin/users/* (Admin SDK) ตั้ง Custom Claims {role, classroomId} + users/{uid} ให้ตรงกัน และ revokeRefreshTokens เมื่อ claim เปลี่ยน; import CSV ห้ามสร้าง ADMIN
- บันทึกการออกจากหน้าสอบ (สลับแท็บ/blur): client (src/components/exam/use-away-detector.ts) ส่ง "ช่วงที่ออก" ตอนกลับมาที่ POST /api/attempts/[id]/events; server ใช้เวลาของตัวเอง, clamp ระยะเวลา, จำกัด 20 รายการ/ครั้ง, 100 รายการ/attempt, throttle 1 วินาที; ตัวนับอยู่ใน `attempts.integrity` (เขียนด้วย field path + increment ผ่าน Admin SDK เท่านั้น) ครูดู log ผ่าน GET เดียวกัน (ตรวจ examOwnerId) logic pure อยู่ที่ src/lib/integrity.ts (+test); ข้อมูลนี้เป็นสัญญาณประกอบ ไม่ใช่หลักฐานชี้ขาด (ฝั่ง client ถูกหลีกเลี่ยงได้)
- Rules tests: `npm run test:rules` (ต้องผ่านก่อน commit ทุกครั้งที่แตะ firestore.rules)
- นักเรียนแก้ได้เฉพาะ field `answers` ของ attempt ตัวเอง ก่อน deadline
- Error response ห้ามเปิดเผยรายละเอียดภายใน

## โครงสร้างโฟลเดอร์
src/app/(auth)/login | admin/ | teacher/ | student/ | api/
src/lib/ firebase-client.ts, firebase-admin.ts, auth-guard.ts, grading.ts, schemas.ts
src/components/ ui/, exam/, question/
firestore.rules, firestore.rules.test.ts, firebase.json

## ธรรมเนียมโค้ด
- ชื่อไฟล์ kebab-case, component PascalCase, ตัวแปร camelCase
- ฟังก์ชันที่มี logic สำคัญ (grading, deadline, สิทธิ์) ต้องเขียนเป็น pure function แยกไฟล์ พร้อม unit test
- UI ภาษาไทย, โค้ดและ comment ภาษาอังกฤษ
- รองรับมือถือ (นักเรียนอาจสอบผ่านมือถือ)

## วิธีทำงาน
- ทำทีละงานตามที่สั่ง อย่าทำเกินขอบเขต
- ก่อนแก้ไฟล์ใหญ่ ให้สรุปแผนสั้น ๆ ก่อน
- จบงานให้บอก: ไฟล์ที่แก้, วิธีทดสอบ, สิ่งที่ยังไม่ได้ทำ
- ใช้ Firebase จริง (โปรเจกต์ exam-sys-ce450) ผ่าน .env.local — ห้าม commit .env.local และ serviceAccountKey.json
- ห้ามรันสคริปต์ที่เขียน/ลบข้อมูลโดยไม่ได้สั่ง และห้ามสร้างบัญชีทดสอบรหัสผ่านง่ายบน Firebase จริง