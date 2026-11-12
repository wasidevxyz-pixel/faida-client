"""D.WATSON local AI Brain.

This service deliberately contains no MongoDB client and no ERP credentials.
Node.js is the only approved gateway to ERP data and actions.
"""
import os
import re
import uuid
from calendar import monthrange
from datetime import date
from typing import Any, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="D.WATSON AI Brain", version="0.1.0")
MAX_CONTEXT_MESSAGES = 12
conversations: dict[str, list[dict[str, str]]] = {}

# Intent aliases deliberately contain no ERP routes or permission data. The Node.js
# gateway resolves these IDs using its server-owned action catalog.
NAVIGATION = {
    "accounts": "accounts.open",
    "account categories": "account_categories.open",
    "account groups": "account_groups.open",
    "attendance list": "attendance_list.open",
    "import attendance": "import_attendance.open",
    "employee attendance detail": "employee_attendance_detail.open",
    "audit logs": "audit_logs.open",
    "backup": "backup.open",
    "banks": "banks.open",
    "bank management": "bank_management.open",
    "bank summary pro": "bank_summary_pro.open",
    "pending cheque v2": "pending_cheque_v2.open",
    "cash counter": "cash_counter.open",
    "daily cash": "daily_cash.open",
    "cash sales": "cash_sales.open",
    "customer demand": "customer_demand.open",
    "customer payments": "customer_payments.open",
    "customer categories": "customer_categories.open",
    "commission item": "commission_item.open",
    "commission supplier": "commission_supplier.open",
    "commission category": "commission_category.open",
    "commission branch": "commission_branch.open",
    "companies": "companies.open",
    "classes": "classes.open",
    "subclasses": "subclasses.open",
    "categories": "categories.open",
    "item categories": "item_categories.open",
    "supplier categories": "supplier_categories.open",
    "departments": "departments.open",
    "designations": "designations.open",
    "branch departments": "branch_departments.open",
    "employee list": "employee_list.open",
    "employee registration": "employee_registration.open",
    "employee advance": "employee_advance.open",
    "employee advance activity": "employee_advance_activity.open",
    "employee adjustment": "employee_adjustment.open",
    "employee commission": "employee_commission.open",
    "employee sale commission": "employee_sale_commission.open",
    "employee clearance": "employee_clearance.open",
    "employee penalty": "employee_penalty.open",
    "expenses": "expenses.open",
    "exemption invoices": "exemption_invoices.open",
    "food invoice": "food_invoice.open",
    "groups": "groups.open",
    "check rights": "check_rights.open",
    "holy days": "holy_days.open",
    "hr dashboard": "hr_dashboard.open",
    "dashboard": "dashboard.open",
    "items": "items.open",
    "stores": "stores.open",
    "stock": "stock.open",
    "stock adjustments": "stock_adjustments.open",
    "stock audit": "stock_audit.open",
    "legacy payroll": "legacy_payroll.open",
    "parties": "parties.open",
    "suppliers": "suppliers.open",
    "supplier payments": "supplier_payments.open",
    "supplier tax certificate": "supplier_tax_certificate.open",
    "supplier wh tax": "supplier_wh_tax.open",
    "payroll": "payroll.open",
    "print payroll": "print_payroll.open",
    "employee payroll list": "employee_payroll_list.open",
    "employee payroll status": "employee_payroll_status.open",
    "print employee payroll status": "print_employee_payroll_status.open",
    "payments": "payments.open",
    "payment vouchers": "payment_vouchers.open",
    "payment vouchers list": "payment_vouchers_list.open",
    "payment voucher print": "payment_voucher_print.open",
    "purchases": "purchases.open",
    "purchase returns": "purchase_returns.open",
    "receipts": "receipts.open",
    "pending chq details": "pending_chq_details.open",
    "sales": "sales.open",
    "sale returns": "sale_returns.open",
    "settings": "settings.open",
    "sub branches": "sub_branches.open",
    "taxes": "taxes.open",
    "zakats": "zakats.open",
    "units": "units.open",
    "users": "users.open",
    "vouchers": "vouchers.open",
    "voucher": "voucher.open",
    "voucher print": "voucher_print.open",
    "wh customer": "wh_customer.open",
    "wh customer payment": "wh_customer_payment.open",
    "wh item": "wh_item.open",
    "wh purchase": "wh_purchase.open",
    "wh purchase return": "wh_purchase_return.open",
    "wh sale": "wh_sale.open",
    "wh sale return": "wh_sale_return.open",
    "wh supplier": "wh_supplier.open",
    "wh barcode": "wh_barcode.open",
    "wh stock audit": "wh_stock_audit.open",
    "wh print": "wh_print.open"
}

REPORTS = {
    "employee attendance report": ("employee_attendance_report.open", "Employee Attendance Report"),
    "attendance sheet": ("employee_attendance_report.open", "Employee Attendance Report"),
    "overtime shorttime report": ("overtime_shorttime_report.open", "Overtime Shorttime Report"),
    "employee schedule report": ("employee_schedule_report.open", "Employee Schedule Report"),
    "bank ledger": ("bank_ledger.open", "Bank Ledger"),
    "bank paid salary report": ("bank_paid_salary_report.open", "Bank Paid Salary Report"),
    "cash counter report": ("cash_counter_report.open", "Cash Counter Report"),
    "cash paid salary report": ("cash_paid_salary_report.open", "Cash Paid Salary Report"),
    "customer receipts report": ("customer_receipts_report.open", "Customer Receipts Report"),
    "closing sheet": ("closing_sheet.open", "Closing Sheet"),
    "closing sheet tabs": ("closing_sheet_tabs.open", "Closing Sheet Tabs"),
    "print closing sheet": ("print_closing_sheet.open", "Print Closing Sheet"),
    "employee increment report": ("employee_increment_report.open", "Employee Increment Report"),
    "employee balances report": ("employee_balances_report.open", "Employee Balances Report"),
    "employee ledger report": ("employee_ledger_report.open", "Employee Ledger Report"),
    "advance pay rec report": ("advance_pay_rec_report.open", "Advance Pay Rec Report"),
    "expense report": ("expense_report.open", "Expense Report"),
    "exemption invoices report": ("exemption_invoices_report.open", "Exemption Invoices Report"),
    "income statement": ("income_statement.open", "Income Statement"),
    "stock report": ("stock_report.open", "Stock Report"),
    "stock adjustments report": ("stock_adjustments_report.open", "Stock Adjustments Report"),
    "stock position report": ("stock_position_report.open", "Stock Position Report"),
    "stock audit report": ("stock_audit_report.open", "Stock Audit Report"),
    "ledger report": ("ledger_report.open", "Ledger Report"),
    "supplier tax report": ("supplier_tax_report.open", "Supplier Tax Report"),
    "payroll report": ("payroll_report.open", "Payroll Report"),
    "employee payroll summary report": ("employee_payroll_summary_report.open", "Employee Payroll Summary Report"),
    "employee salary detail report": ("employee_salary_detail_report.open", "Employee Salary Detail Report"),
    "wh ded report": ("wh_ded_report.open", "Wh Ded Report"),
    "payment reports": ("payment_reports.open", "Payment Reports"),
    "profit loss report": ("profit_loss_report.open", "Profit Loss Report"),
    "purchase report": ("purchase_report.open", "Purchase Report"),
    "reports": ("reports.open", "Reports"),
    "sales report": ("sales_report.open", "Sales Report"),
    "date wise sales report": ("date_wise_sales_report.open", "Date Wise Sales Report"),
    "sales comparison report": ("sales_comparison_report.open", "Sales Comparison Report"),
    "department sales report": ("department_sales_report.open", "Department Sales Report"),
    "party statement report": ("party_statement_report.open", "Party Statement Report"),
    "wh customer ledger report": ("wh_customer_ledger_report.open", "Wh Customer Ledger Report"),
    "wh customer balance report": ("wh_customer_balance_report.open", "Wh Customer Balance Report"),
    "wh item ledger report": ("wh_item_ledger_report.open", "Wh Item Ledger Report"),
    "wh stock activity report": ("wh_stock_activity_report.open", "Wh Stock Activity Report"),
    "dept wise report": ("dept_wise_report.open", "Dept Wise Report"),
    "sub dept wise report": ("sub_dept_wise_report.open", "Sub Dept Wise Report"),
    "shop date wise sale report": ("shop_date_wise_sale_report.open", "Shop Date Wise Sale Report"),
    "supplier payments report": ("supplier_payments_report.open", "Supplier Payments Report"),
    "vouchers report": ("vouchers_report.open", "Vouchers Report")
}

MONTHS = {name: index for index, name in enumerate(
    ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"), 1
)}


class UserContext(BaseModel):
    id: str
    name: str = "ERP User"
    role: str = ""
    branches: list[Any] = Field(default_factory=list)
    rights: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: Optional[str] = Field(default=None, max_length=100)
    user: UserContext


def verify_gateway(key: Optional[str]) -> None:
    expected = os.getenv("AI_BRAIN_SHARED_SECRET")
    if not expected or key != expected:
        raise HTTPException(status_code=401, detail="AI Brain gateway authentication failed")


def navigation_for(message: str) -> Optional[dict[str, str]]:
    normalized = re.sub(r"\s+", " ", message.lower()).strip()
    if not any(phrase in normalized for phrase in ("open ", "go to ", "show screen", "take me")):
        return None
    for label, action_id in NAVIGATION.items():
        if label in normalized:
            return {"type": "navigate", "id": action_id, "label": label.title()}
    return None


def date_range_for(message: str) -> dict[str, str]:
    """Parse only unambiguous date phrases; otherwise leave ERP defaults intact."""
    normalized = message.lower()
    current_year = date.today().year
    months = "|".join(MONTHS)
    range_match = re.search(rf"({months})\s+(\d{{1,2}})(?:st|nd|rd|th)?\s*(?:to|through|until|-)\s*({months})?\s*(\d{{1,2}})(?:st|nd|rd|th)?", normalized)
    if range_match:
        first_month, first_day, second_month, second_day = range_match.groups()
        end_month = second_month or first_month
        try:
            start = date(current_year, MONTHS[first_month], int(first_day))
            end = date(current_year, MONTHS[end_month], int(second_day))
            return {"startDate": start.isoformat(), "endDate": end.isoformat()}
        except ValueError:
            return {}
    # Explicit month + year like "July 26" or "July 2026" -> treat as month of that year
    month_year_match = re.search(rf"\b({months})\s+(\d{{2,4}})\b", normalized)
    if month_year_match:
        month_name, year_token = month_year_match.groups()
        year = int(year_token) if len(year_token) == 4 else (2000 + int(year_token))
        try:
            month = MONTHS[month_name]
            start = date(year, month, 1)
            if month == 12:
                end = date(year, 12, 31)
            else:
                end = date(year, month, monthrange(year, month)[1])
            return {"startDate": start.isoformat(), "endDate": end.isoformat()}
        except Exception:
            return {}
    month_match = re.search(rf"\b({months})\b", normalized)
    if month_match:
        month = MONTHS[month_match.group(1)]
        start = date(current_year, month, 1)
        if month == 12:
            end = date(current_year, 12, 31)
        else:
            end = date(current_year, month, monthrange(current_year, month)[1])
        return {"startDate": start.isoformat(), "endDate": end.isoformat()}
    return {}


def report_for(message: str) -> Optional[dict[str, Any]]:
    normalized = message.lower()
    if not any(token in normalized for token in ("report", "show", "give me", "generate", "export", "download")):
        return None
    for phrase, (action_id, label) in REPORTS.items():
        if phrase in normalized:
            return {"type": "open_report", "id": action_id, "label": label, "params": date_range_for(message)}
    return None


def summary_for(message: str) -> Optional[dict[str, str]]:
    normalized = message.lower()
    if not any(phrase in normalized for phrase in ("today", "today's", "todays")):
        return None
    if "purchase" in normalized:
        return {"type": "business_summary", "metric": "today_purchases"}
    if "sale" in normalized:
        return {"type": "business_summary", "metric": "today_sales"}
    return None


def configured_model() -> str:
    return os.getenv("LOCAL_MODEL") or os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")


def conversation_key(user: UserContext, conversation_id: str) -> str:
    return f"{user.id}:{conversation_id}"


def conversation_history(user: UserContext, conversation_id: str) -> list[dict[str, str]]:
    return conversations.get(conversation_key(user, conversation_id), [])[-MAX_CONTEXT_MESSAGES:]


def remember(user: UserContext, conversation_id: str, role: str, content: str) -> None:
    key = conversation_key(user, conversation_id)
    conversations[key] = (conversations.get(key, []) + [{"role": role, "content": content}])[-MAX_CONTEXT_MESSAGES:]


async def ask_local_model(message: str, user: UserContext, conversation_id: str) -> str:
    model = configured_model()
    provider = os.getenv("MODEL_PROVIDER", "ollama").lower()
    url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    system = (
        "You are Amey, a concise internal ERP assistant. You do not have direct database access, "
        "must not claim an action was performed, and must request confirmation before any write action. "
        "Explain what data or report should be requested through approved ERP tools. "
        "Format any lists or data tables properly in Markdown. "
        "If the user asks to generate or export a PDF, DO NOT say you lack the tools. Instead, output the requested data normally "
        "and tell the user to click the 'Download PDF' icon in the top right of this chat panel."
    )
    messages = [
        {"role": "system", "content": system},
        *conversation_history(user, conversation_id),
        {"role": "user", "content": f"User role: {user.role}. Question: {message}"},
    ]
    async with httpx.AsyncClient(timeout=45) as client:
        if provider == "openai-compatible":
            base_url = os.getenv("OPENAI_COMPATIBLE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
            response = await client.post(f"{base_url}/chat/completions", json={"model": model, "messages": messages, "temperature": 0.2})
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
        if provider == "groq":
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                raise ValueError("GROQ_API_KEY is not set")
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "messages": messages, "temperature": 0.2}
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
        if provider != "ollama":
            raise ValueError("Unsupported MODEL_PROVIDER")
        response = await client.post(f"{url}/api/chat", json={"model": model, "stream": False, "messages": messages})
        response.raise_for_status()
        return response.json()["message"]["content"].strip()


@app.get("/health")
async def health(x_ai_brain_key: Optional[str] = Header(default=None)):
    verify_gateway(x_ai_brain_key)
    return {"status": "ok", "provider": os.getenv("MODEL_PROVIDER", "ollama"), "model": configured_model()}


@app.get("/v1/capabilities")
async def capabilities(x_ai_brain_key: Optional[str] = Header(default=None)):
    verify_gateway(x_ai_brain_key)
    return {"read_only": True, "actions": ["navigate"], "navigation": NAVIGATION}


@app.post("/v1/chat")
async def chat(request: ChatRequest, x_ai_brain_key: Optional[str] = Header(default=None)):
    verify_gateway(x_ai_brain_key)
    conversation_id = request.conversation_id or uuid.uuid4().hex
    action = navigation_for(request.message)
    if action:
        answer = f"Opening {action['label']}."
        remember(request.user, conversation_id, "user", request.message)
        remember(request.user, conversation_id, "assistant", answer)
        return {"answer": answer, "action": action, "conversation_id": conversation_id}
    action = summary_for(request.message)
    if action:
        return {"answer": "Preparing your live ERP summary…", "action": action, "conversation_id": conversation_id}
    action = report_for(request.message)
    if action:
        period = action["params"]
        suffix = f" for {period['startDate']} to {period['endDate']}" if period else ""
        answer = f"Opening {action['label']}{suffix}."
        remember(request.user, conversation_id, "user", request.message)
        remember(request.user, conversation_id, "assistant", answer)
        return {"answer": answer, "action": action, "conversation_id": conversation_id}
    try:
        answer = await ask_local_model(request.message, request.user, conversation_id)
    except (httpx.HTTPError, KeyError, ValueError):
        answer = "Your local AI model is not available yet. I can already open approved ERP screens; start Ollama to enable natural-language assistance."
    remember(request.user, conversation_id, "user", request.message)
    remember(request.user, conversation_id, "assistant", answer)
    return {"answer": answer, "action": None, "conversation_id": conversation_id}
