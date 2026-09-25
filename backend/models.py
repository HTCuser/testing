"""Schema dữ liệu vào/ra của API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ProcedureKind = Literal["van_hanh", "bao_duong", "su_co"]
Severity = Literal["nghiem_trong", "trung_binh", "nhe"]
IncidentSource = Literal["quy_trinh", "kinh_nghiem", "nha_may_khac"]
# Phiếu thao tác được phân theo hai chiều độc lập: bối cảnh phát sinh công tác
# và loại thao tác (tách thiết bị ra hay đưa trở lại vận hành).
FormContext = Literal["van_hanh", "bao_duong"]
FormType = Literal["co_lap", "tai_lap"]


class SpecItem(BaseModel):
    label: str = ""
    value: str = ""


class EquipmentIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    system: str = ""
    location: str = ""
    manufacturer: str = ""
    model: str = ""
    commissioned: str = ""
    specs: list[SpecItem] = []
    notes: str = ""


class Step(BaseModel):
    text: str = ""
    note: str = ""


class ProcedureIn(BaseModel):
    code: str = ""
    title: str = Field(min_length=1, max_length=255)
    kind: ProcedureKind = "van_hanh"
    equipment_id: int | None = None
    summary: str = ""
    conditions: str = ""
    safety: list[str] = []
    steps: list[Step] = []
    source_ref: str = ""
    document_id: int | None = None


class IncidentIn(BaseModel):
    code: str = ""
    title: str = Field(min_length=1, max_length=255)
    equipment_id: int | None = None
    severity: Severity = "trung_binh"
    source: IncidentSource = "quy_trinh"
    symptoms: list[str] = []
    causes: list[str] = []
    actions: list[str] = []
    prevention: str = ""
    lesson: str = ""
    occurred_at: str = ""
    tags: str = ""
    source_ref: str = ""
    document_id: int | None = None


class FormRow(BaseModel):
    # section = cột "Mục" trên phiếu giấy (I, II, ...), dùng gộp các bước cùng
    # một hạng mục thao tác; để trống thì bước nối tiếp hạng mục phía trên.
    section: str = ""
    target: str = ""
    action: str = ""
    note: str = ""


class FormIn(BaseModel):
    code: str = ""
    title: str = Field(min_length=1, max_length=255)
    context: FormContext = "bao_duong"
    form_type: FormType = "co_lap"
    work_type: str = ""
    equipment_id: int | None = None
    requesting_unit: str = ""
    purpose: str = ""
    # Điều kiện được đánh số trên phiếu giấy nên lưu thành danh sách.
    # Phiếu thao tác không mang biện pháp an toàn — mục đó thuộc phiếu công tác.
    conditions: list[str] = []
    rows: list[FormRow] = []
    notes: str = ""


class DocumentUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    equipment_id: int | None = None
    tags: str | None = None
    version: str | None = None
    issued_date: str | None = None
    description: str | None = None


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    top_k: int | None = None
    category: str | None = None
    equipment_id: int | None = None
    source_kind: str | None = None


JournalKind = Literal["thao_tac", "bao_duong"]


class JournalIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    started_at: str = ""
    finished_at: str = ""
    shift: str = ""
    equipment_id: int | None = None
    ref: str = ""
    performers: str = ""
    leader: str = ""
    details: str = ""
    materials: str = ""
    result: str = ""
    notes: str = ""
    tags: str = ""
