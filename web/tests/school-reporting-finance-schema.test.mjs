import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20261030000800_school_reporting_finance.sql', import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');
const operationsSql = await readFile(fileURLToPath(
    new URL('../../supabase/migrations/20261030001300_school_finance_operations.sql', import.meta.url),
), 'utf8');
const reportRangesSql = await readFile(fileURLToPath(
    new URL('../../supabase/migrations/20261030001400_school_operational_report_ranges.sql', import.meta.url),
), 'utf8');

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

test('finance operations use bounded same-tenant summaries and keyset pagination', () => {
    for (const functionName of ['school_admin_payment_order_summary', 'school_admin_payment_orders_page']) {
        const start = operationsSql.indexOf(`create or replace function public.${functionName}`);
        assert.notEqual(start, -1, `${functionName} exists`);
        const next = operationsSql.indexOf('create or replace function public.', start + 1);
        const body = operationsSql.slice(start, next === -1 ? undefined : next);
        assert.match(body, /public\.current_user_is_active\(\)/);
        assert.match(body, /public\.current_app_role\(\)\)\s*<>\s*'admin_sekolah'/);
        assert.match(body, /purchase\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
        assert.match(body, /purchase\.product_type = 'school'/);
        assert.match(body, /p_end_date - p_start_date > 365/);
        assert.match(body, /p_end_date > \(now\(\) at time zone 'UTC'\)::date/);
        assert.doesNotMatch(body, /purchase\.owner_id|midtrans_transaction_id|redirect_url/);
    }
    assert.match(operationsSql, /payment_orders_tenant_created_idx/);
    assert.match(operationsSql, /\(purchase\.created_at, purchase\.order_id\) < \(p_after_created_at, p_after_order_id\)/);
    assert.match(operationsSql, /p_limit not between 1 and 101/);
});

test('operational attendance ranges are bounded, aggregate-only, and tenant scoped', () => {
    assert.match(reportRangesSql, /school_admin_attendance_report_range\(\s*p_start_date date,\s*p_end_date date\s*\)/);
    assert.match(reportRangesSql, /public\.current_user_is_active\(\)/);
    assert.match(reportRangesSql, /public\.current_app_role\(\)\)\s*<>\s*'admin_sekolah'/);
    assert.match(reportRangesSql, /attendance\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
    assert.match(reportRangesSql, /attendance\.tanggal between p_start_date and p_end_date/);
    assert.match(reportRangesSql, /p_end_date - p_start_date > 365/);
    assert.match(reportRangesSql, /p_end_date > \(now\(\) at time zone 'UTC'\)::date/);
    assert.doesNotMatch(reportRangesSql, /student_id|attendance\.nama|nisn/);
});
