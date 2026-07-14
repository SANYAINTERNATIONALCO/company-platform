# قاعدة البيانات — Supabase (Postgres)

كل الجداول عليها RLS بسياسة "Allow all" (الحماية الفعلية عبر Auth + منطق الأدوار في الواجهة).

## الجداول الرئيسية

### employees
الموظفون. أعمدة مهمة: `name, job_title, hire_date, status('active'), shift_type('يومي'/'روتيشن'), base_salary, sort_order, passport_number` + حقول السلفة: `advance_total, advance_monthly_deduction, advance_remaining, advance_total_installments, advance_completed_installments` + `overtime_leave_balance` (رصيد الإجازة التعويضية التراكمي، يُحدَّث من Overtime.tsx وAttendance.tsx)

### attendance_records
`employee_id, record_date, status, check_in, check_out` — الحالات نصوص عربية (انظر CLAUDE.md)

### overtime_records
سجل أيام الأوفرتايم. `employee_id, overtime_date, notes, created_at` — كل صف = يوم أوفرتايم واحد = +1 لعمود `employees.overtime_leave_balance` (يُدار من `app/components/Overtime.tsx`؛ الحذف يُرجع الرصيد −1)

### payroll_records
أرشيف الرواتب الشهري. `UNIQUE(employee_id, payroll_month)` — payroll_month بصيغة YYYY-MM. أعمدة: `base_salary, absent_days, absent_deduction, advance_deduction, extra_amount, net_salary, notes`

### payroll_approvals
توقيعات الموافقة الشهرية. `UNIQUE(payroll_month, role_name)` — role_name: site_manager / hr_manager. أعمدة: `signature_url, signature_scale, person_name`

### signatures
التوقيع الدائم (للكتب الرسمية). `role_name UNIQUE, person_name, signature_url, signature_scale`

### funds / expenses / fuel_receipts / maintenance_receipts / delivery_receipts
السلف والمصاريف والوصولات (كاز P / صيانة C / تسليم M بترقيم مستقل عبر `receipt_counters`). الوصولات فيها `attachment_url`

### tourist_visas / annual_visas / visa_stats / visa_files
التأشيرات. annual_visas: `expiry = entry + سنة` (عمود GENERATED). visa_stats فئات قابلة للتعديل: total, multiple_visa, applied_multiple, violators, tourist_visas × جنسيات (chinese/pakistani)

### visa_cycles
دورات المغادرة والعودة. `person_name, passport_number, nationality, visa_expired_date` (بداية سماح 60 يوم)، `exit_visa_issued_date` (10 أيام)، `new_visa_obtained/new_visa_type/new_visa_number`، `departure_date/departure_notes`، `return_date`، `status(grace_period/exit_visa_issued/departed/completed)`، `group_name` (للمجموعات — NULL = فردي)

### tasks
`title, description, created_by(+name), assigned_to(+name), priority(normal/important/urgent), status(pending/in_progress/completed), due_date, is_seen`
الهرمية: admin يكلّف الجميع، editor يكلّف المحاسب فقط، accountant لا يكلّف. المستخدمون hardcoded في Tasks.tsx

### official_documents / document_counters / document_assets
الكتب الرسمية: `doc_number, doc_type(SAL/ATT/EMP/CON/WRN/TRM), doc_language(ar/en), doc_content JSONB` (لإعادة الطباعة). العدادات لكل نوع. document_assets: letterhead_top / letterhead_bottom

### custody_items
العهد: `employee_id, item_name, item_type(vehicle/laptop/phone/tools/other), serial_number, received_date, returned_date, status(active/returned)`

### contracts
العقود: `employee_id, contract_type(fixed/permanent), start_date, end_date, status(active/renewed/expired/terminated)` — تنبيه قبل 30 يوماً من النهاية

### activity_log
`user_email, user_role, action, section, details, created_at` — section='auth' لتسجيلات الدخول (تُعرض في تبويب منفصل)

### user_roles
`user_id → auth.users, role` بقيد: editor/admin/accountant/guest_1/guest_2

## Views
- `monthly_attendance_summary` — أعمدة عربية حرفية: الاسم، الشهر، أيام الدوام، روتيشن، ايام الجمعه، عدد ايام الغياب، إجازة مرضية، إجازة طارئة، إجازة اعتيادية، إجازة تعويضية، إجازة وفاة، عطلة رسمية، مجموع الايام. (إعادة إنشائه تتطلب DROP ثم CREATE بنفس الأسماء)
- `funds_summary` — أعمدة عربية: المصدر، تاريخ الاستلام، المبلغ المستلم، إجمالي المصروف، المتبقي، ملاحظات

## Storage Buckets
employee-files, visa-files, receipt-attachments, signatures, assets (الشعار + الترويسة والتذييل)

## المستخدمون
- hr@sanyacement.com → editor
- site.manager@sanyacement.com → admin
- husseinsattar651@gmail.com → accountant
- guest_1@sanyacement.com → guest_1

إضافة مستخدم: أنشئه في Authentication أولاً ثم:
`INSERT INTO user_roles (user_id, role) SELECT id, 'الدور' FROM auth.users WHERE email = '...';`
