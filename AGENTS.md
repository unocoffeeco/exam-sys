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
users/{uid}: name, email, role[ADMIN|TEACHER|STUDENT], classroomId (นักเรียน), subjectId + gradeLevel (ครู: 1 คน 1 วิชา 1 ระดับชั้น)
classrooms/{id}: ..., gradeLevel
subjects/{id}
questions/{id}: ownerId, subjectId, type, body, points, choices[{id,text,isCorrect}], explanation
exams/{id}: ownerId, subjectId, gradeLevel, title, durationMin, openAt, closeAt, shuffleQuestions, shuffleChoices, showResult, status, classroomIds[]
examPapers/{examId}: questions[{id,type,body,points,choices[{id,text}]}]   ← ไม่มีเฉลย
examKeys/{examId}: answers{qid: {type, points, correct: choiceId | acceptedTexts[] | null}}                ← Admin SDK เท่านั้น
attemptEvents/{attemptId}: examId, examOwnerId, studentId, events[{type:'AWAY', via, durationMs, reportedAtMs}], truncated, lastReportMs   ← Admin SDK เท่านั้น (Rules ไม่มี match = ปฏิเสธ)
attempts/{examId}_{studentUid}: examId, examOwnerId, studentId, studentName, classroomId, showResult, startedAt, deadlineAt, submittedAt, order[], choiceOrder{}, answers{qid:value}, status, integrity{awayCount, awayTotalMs}   ← ไม่เก็บ score ที่นี่
attemptResults/{attemptId}: examId, examOwnerId, studentId, showResult, score, manualScores{}, gradedAt   ← Admin SDK เขียนเท่านั้น

### ค่า status (เปลี่ยนย้อนกลับไม่ได้)
- exams.status: DRAFT → PUBLISHED → CLOSED (ผ่าน API เท่านั้น ยกเว้นแก้ DRAFT)
- attempts.status: IN_PROGRESS → SUBMITTED → GRADED (หมดเวลาแต่ไม่ส่ง: finalize เปลี่ยนเป็น SUBMITTED แล้วตรวจ)

## กฎประหยัด Firestore quota
- รวมข้อมูลที่อัปเดตพร้อมกันไว้ในเอกสารเดียว (map)
- อัปเดตด้วย updateDoc + field path เช่น `answers.${qid}` ห้ามเขียนทับทั้งเอกสาร
- Autosave: เก็บ localStorage ทันที แล้ว flush เมื่อเปลี่ยนข้อ หรือทุก 30 วินาทีถ้ามีการเปลี่ยนแปลง
- หน้ารายงานใช้ query เดียว ห้ามวนอ่านทีละเอกสาร ห้าม polling

### งบ quota Spark (อ่าน 50,000 / เขียน 20,000 ต่อวัน; รีเซ็ตเที่ยงคืนเวลา Pacific ≈ 14:00–15:00 น. ไทย)
ประมาณการต่อนักเรียน 1 คน ต่อการสอบ 1 วิชา (ตัวเลขเริ่มต้น ให้ปรับตามจริง):
- เขียน ≈ 35: start 1 + autosave ≤ 30 + submit 2 (attempts, attemptResults) + events ≤ 2
- อ่าน ≈ 8: รายการสอบ/exam 2 + examPapers 1 + attempt 2 + ผลสอบ 1 + login/อื่น ๆ 2
- ตัวอย่าง 400 คน: เขียน ≈ 14,000 (70%) อ่าน ≈ 3,200 + รายงานครู (1 query ≈ จำนวนนักเรียน/ครั้ง)
- เพดาน: สอบพร้อมกันได้ไม่เกิน ~500 คน/วัน ถ้ามีหลายวิชาในวันเดียวต้องรวมโควตาทุกวิชา; ห้ามเพิ่มความถี่ autosave หรือ events เกินที่กำหนด

## Security
- ทุก API route: verify ID token → ตรวจ role (Custom Claims) → ตรวจความเป็นเจ้าของ → Zod validate
- role และ classroomId (นักเรียน) เก็บใน Custom Claims อ่านผ่าน `request.auth.token` ใน Rules (ห้ามใช้ get() อ่าน users) ถ้าย้ายห้อง ต้องอัปเดต claim ด้วย Admin SDK
- ล็อกวิชา/ระดับชั้นของครู: Custom Claims ของครู = `{role, subjectId, gradeLevel}` (ค่าเดียว ไม่ใช่ array) ตั้งผ่าน /api/admin/users/* พร้อมอัปเดต users/{uid} และ revokeRefreshTokens เมื่อเปลี่ยน
  - Rules: ครูสร้าง/แก้ questions และ exams (DRAFT) ได้เมื่อ `subjectId`/`gradeLevel` ตรงกับ claim และห้ามแก้สองฟิลด์นี้หลังสร้าง
  - Publish API: ตรวจว่า classroomIds ทุกห้องมี gradeLevel ตรงกับของครู (ครูสอนได้ทุกห้องในระดับชั้นนั้น เลือกห้องตอนสร้างชุดข้อสอบ) logic อยู่ใน src/lib/publish.ts (pure + test)
  - ครูเห็นเฉพาะข้อสอบ/คลังข้อสอบของตัวเอง (ownerId) แม้เป็นวิชาเดียวกัน
  - ต้องมี Rules test: ครูข้ามวิชา/ข้ามระดับชั้นสร้างหรือแก้ไม่ได้
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
- นักเรียนแก้ได้เฉพาะ field `answers` ของ attempt ตัวเอง; Rules ต้องตรวจ `request.time < resource.data.deadlineAt` และ `resource.data.status == 'IN_PROGRESS'` และ `affectedKeys().hasOnly(['answers'])`
- นักเรียนอ่าน `questions` ไม่ได้เลย (มี isCorrect) ข้อสอบที่นักเรียนเห็นมาจาก examPapers เท่านั้น; publish API คัดลอกข้อสอบจาก questions → examPapers (ไม่มีเฉลย) และ examKeys (เฉลย) ใน batch เดียว และหลัง publish แก้ข้อสอบไม่ได้
- Error response ห้ามเปิดเผยรายละเอียดภายใน

## กฎเวลาและการส่งสอบ
- `deadlineAt = min(startedAt + durationMin, closeAt)` คำนวณที่ server ใน start API ด้วย server time เท่านั้น (pure ใน exam-session.ts + test)
- Start ต้องอยู่ในช่วง openAt ≤ now < closeAt และ exam.status = PUBLISHED
- Rules: client เขียน `answers` หลัง deadlineAt ไม่ได้ (ไม่มี grace ฝั่ง Rules)
- Submit รับ answers ชุดสุดท้ายได้ถ้า server time ≤ deadlineAt + grace 5 วินาที (เผื่อเครือข่ายช้า) เกินนี้ใช้เฉพาะ answers ที่บันทึกไว้แล้ว
- Start / submit / finalize / grade ต้อง idempotent: start ซ้ำคืน attempt เดิม (ไม่สร้างใหม่), submit/finalize ซ้ำคืนผลเดิม (ตรวจ status ก่อน), grade ซ้ำเขียนทับด้วยค่าเดียวกันได้
- Rate limit: ใช้ idempotency + ตรวจ status แทนตัวนับแยก (ไม่เพิ่มการเขียน Firestore); events ใช้ throttle เดิม; ห้ามใช้ in-memory rate limit เพราะ serverless ไม่ถาวร

## การตรวจอัตนัย (grading.ts)
- เทียบข้อความด้วย normalize ทั้งสองฝั่ง: Unicode NFC → ตัดช่องว่างหัวท้าย → ยุบช่องว่างซ้อนเป็นช่องเดียว → ลบอักขระความกว้างศูนย์ → lowercase (อังกฤษ)
- ไม่ลบวรรณยุกต์/สระโดยอัตโนมัติ (เปลี่ยนความหมาย) ให้ครูใส่รูปแบบที่ยอมรับใน acceptedTexts เอง
- ข้อที่ acceptedTexts เป็น null ให้ครูตรวจเอง (manualScores) ผ่าน /api/attempts/[id]/grade
- ต้องมี unit test ครอบคลุมภาษาไทยและอังกฤษ

## Vercel Hobby
- Hobby จำกัดเวลา function สั้นมาก (ตรวจเพดานปัจจุบันในเอกสาร Vercel) ดังนั้น finalize/grade ต้องทำเป็นชุดเล็ก (เช่น ≤ 50 attempts ต่อครั้ง ใช้ batch write ของ Firestore) และเรียกซ้ำจนครบ (idempotent)
- ห้ามทำงานยาว/background; ไม่มี cron (ใช้ lazy finalize ตามที่กำหนด)
- Hobby ใช้ได้เฉพาะงานไม่เชิงพาณิชย์ ถ้าโรงเรียนมีรายได้/เก็บค่าบริการต้องพิจารณาแผนอื่น

## ความเป็นส่วนตัวของข้อมูล (PDPA)
- นักเรียนอาจเป็นผู้เยาว์: ห้าม log ชื่อ/อีเมล/คำตอบใน console หรือ error response; log ได้เฉพาะ uid, attemptId, รหัสข้อผิดพลาด
- เก็บข้อมูลเท่าที่จำเป็น; นักเรียนอ่านได้เฉพาะ attempt/ผลของตัวเอง ครูเห็นเฉพาะข้อสอบของตัวเอง
- ระยะเวลาเก็บ (ค่าเริ่มต้น ให้โรงเรียนยืนยัน): attempts, attemptResults, attemptEvents เก็บ 1 ปีการศึกษา แล้วลบผ่าน API ของแอดมิน (/api/admin/purge) ที่ลบเป็นชุดและต้องสั่งเอง ไม่มีงานอัตโนมัติ
- ห้ามนำข้อมูลจริงไปใช้ในเทสต์/เอกสาร/screenshot

## โครงสร้างโฟลเดอร์
src/app/(auth)/login | admin/ | teacher/ | student/ | api/
src/app/api/ exams/[id]/{publish,close,start,finalize} | attempts/[id]/{submit,grade,events} | admin/users/*
src/lib/ firebase-client.ts, firebase-admin.ts, auth-guard.ts, schemas.ts, grading.ts, publish.ts, exam-session.ts, integrity.ts (pure ตัวหลังๆ มี test)
src/components/ ui/, exam/ (รวม use-away-detector.ts), question/
firestore.rules, firestore.rules.test.ts, firebase.json

## Rules / Indexes / Env
- firestore.indexes.json ต้องมีทุก composite query ที่ใช้จริง; เพิ่ม query ใหม่ต้องเพิ่ม index ด้วย
- Deploy rules/indexes ด้วยมือเท่านั้น: `firebase deploy --only firestore` (รัน `npm run test:rules` ก่อน และห้ามรันเองโดยไม่ได้สั่ง)
- Env vars ทุกตัวต้องมีชื่อใน `.env.example` (ไม่ใส่ค่าจริง): ค่า public ของ Firebase client (`NEXT_PUBLIC_FIREBASE_*`) และค่า service account สำหรับ firebase-admin
- บน Vercel ใส่ service account ผ่าน Environment Variables (เช่น base64 ของ JSON) ห้ามใส่ไฟล์ในรีโป
- `.gitignore` ต้องมี `.env.local`, `serviceAccountKey.json`

## คำสั่งมาตรฐาน (ต้องผ่านทั้งหมดก่อนจบงาน)
- `npm test` — unit test (Vitest)
- `npm run lint`
- `npm run typecheck` (`tsc --noEmit`)
- `npm run test:rules` — เฉพาะเมื่อแตะ firestore.rules (ใช้ Emulator)

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