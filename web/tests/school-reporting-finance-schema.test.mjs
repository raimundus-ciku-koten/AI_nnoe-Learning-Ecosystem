import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20261030000800_school_reporting_finance.sql', import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

test('school reports and finance RPCs are active-admin and same-tenant scoped', () => {
    assert.equal(sql.split("public.current_app_role()) <> 'admin_sekolah'").length - 1, 2);
    assert.ok(sql.includes('purchase.tenant_id = (select public.current_tenant_id())'));
    assert.ok(sql.includes('attendance.tenant_id = (select public.current_tenant_id())'));
    assert.ok(sql.includes('revoke all on function public.school_admin_attendance_report() from public, anon'));
    assert.ok(sql.includes('revoke all on function public.school_admin_payment_orders() from public, anon'));
});

test('attendance reporting returns daily class aggregates without student identifiers', () => {
    const report = sql.slice(sql.indexOf('create or replace function public.school_admin_attendance_report'));
    const payment = report.indexOf('create or replace function public.school_admin_payment_orders');
    const attendanceFunction = report.slice(0, payment);
    assert.match(attendanceFunction, /returns table\s*\(\s*tanggal date,\s*kelas text,\s*hadir_scan bigint/s);
    assert.ok(attendanceFunction.includes('group by attendance.tanggal, attendance.kelas'));
    assert.ok(attendanceFunction.includes('attendance.tanggal >= current_date - 89'));
    assert.doesNotMatch(attendanceFunction, /student_id|attendance\.nama|nisn/);
});

test('finance projection omits owner identity and payment-provider secrets', () => {
    const finance = sql.slice(sql.indexOf('create or replace function public.school_admin_payment_orders'));
    assert.match(finance, /returns table\s*\(\s*order_id text,\s*plan_name text,\s*billing_cycle text/s);
    assert.ok(finance.includes("purchase.product_type = 'school'"));
    assert.match(finance, /limit 100/);
    assert.doesNotMatch(finance, /purchase\.owner_id|midtrans_transaction_id|redirect_url/);
});
