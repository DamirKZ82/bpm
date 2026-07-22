"""Сквозной сценарий через TestClient (TRUNCATE + пишет в реальную БД bpm).

Админ создаёт справочники и матрицу → инициатор подаёт служебную записку →
юрист и директор согласуют → процесс APPROVED. Вторая служебка — отклонение.
Данные остаются в базе как демо.
"""
import asyncio
import sys

sys.path.insert(0, ".")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from scripts import seed_dev  # noqa: E402

# Повторяемость: чистим данные и пересоздаём dev-админа и системный вид
_TABLES = (
    "audit_log, tasks, process_instances, attachments, documents, "
    "document_type_fields, document_types, dictionary_items, dictionaries, "
    "contracts, counterparties, "
    "integration_outbox, sync_log, external_mapping, route_rules, "
    "project_assignments, substitutions, absences, employments, users, "
    "employees, departments, projects, positions, organizations"
)
with create_engine(settings.database_url).begin() as conn:
    conn.execute(text(f"TRUNCATE {_TABLES} CASCADE"))
asyncio.run(seed_dev.main(), loop_factory=asyncio.SelectorEventLoop)

client = TestClient(app)
FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "OK " if condition else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)


def login(username: str) -> dict:
    resp = client.post("/api/auth/dev-login", json={"username": username})
    assert resp.status_code == 200, f"login {username}: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def post(headers, url, json=None, expect=(200, 201)):
    resp = client.post(url, json=json, headers=headers)
    assert resp.status_code in expect, f"POST {url}: {resp.status_code} {resp.text}"
    return resp.json() if resp.status_code != 204 else None


admin = login("admin")

# --- Справочники ---
org = post(admin, "/api/admin/organizations", {"name": "ТОО Демо-Строй", "bin": "123456789012"})
project = post(admin, "/api/admin/projects", {"name": "ЖК Астана-Сити", "code": "P-01",
                                              "organization_id": org["id"]})
pos_lawyer = post(admin, "/api/admin/positions", {"name": "Юрист"})
pos_director = post(admin, "/api/admin/positions", {"name": "Директор"})
pos_engineer = post(admin, "/api/admin/positions", {"name": "Инженер ПТО"})

emp_lawyer = post(admin, "/api/admin/employees", {"full_name": "Юристов Юрий Юрьевич"})
emp_director = post(admin, "/api/admin/employees", {"full_name": "Директоров Дамир Демоевич"})
emp_engineer = post(admin, "/api/admin/employees", {"full_name": "Инженеров Иван Иванович"})

for emp, pos in [
    (emp_lawyer, pos_lawyer),
    (emp_director, pos_director),
    (emp_engineer, pos_engineer),
]:
    post(admin, "/api/admin/employments", {
        "employee_id": emp["id"], "organization_id": org["id"],
        "position_id": pos["id"], "is_primary": True,
    })

for username, emp in [
    ("lawyer", emp_lawyer),
    ("director", emp_director),
    ("engineer", emp_engineer),
]:
    post(admin, "/api/admin/users", {
        "username": username, "display_name": emp["full_name"],
        "employee_id": emp["id"], "roles": ["INITIATOR"],
    })
check("Справочники: организация, проект, 3 должности, 3 сотрудника, 3 пользователя", True)

# --- Матрица: служебка = этап 1 Юрист, этап 2 Директор ---
post(admin, "/api/admin/route-rules", {
    "object_type": "MEMO", "stage_no": 1, "resolver_type": "POSITION_IN_ORG",
    "position_id": pos_lawyer["id"], "stage_type": "PARALLEL_ALL",
    "deadline_hours": 24, "priority": 100,
})
post(admin, "/api/admin/route-rules", {
    "object_type": "MEMO", "stage_no": 2, "resolver_type": "POSITION_IN_ORG",
    "position_id": pos_director["id"], "stage_type": "SEQUENTIAL",
    "deadline_hours": 48, "priority": 100,
})
check("Матрица маршрутов: 2 этапа для MEMO", True)


def new_doc(headers, subject, body):
    return post(headers, "/api/documents", {
        "type_code": "MEMO", "subject": subject, "body": body,
        "organization_id": org["id"], "project_id": project["id"],
    })


# --- Сценарий 1: полное согласование ---
engineer = login("engineer")
memo = new_doc(engineer, "Закуп спецодежды", "Прошу согласовать закуп 20 комплектов.")
check("Номер присвоен автоматически", memo["number"].startswith("СЗ-"), memo["number"])
memo = post(engineer, f"/api/documents/{memo['id']}/submit", {})
process_id = memo["process"]["id"]
check("Служебка подана, процесс запущен", memo["process"]["status"] == "IN_PROGRESS",
      memo["process"]["status"])

lawyer = login("lawyer")
tasks = client.get("/api/tasks/my", headers=lawyer).json()
check("У юриста 1 активная задача", len(tasks) == 1, f"получено {len(tasks)}")
check("Задача с дедлайном (24ч)", tasks[0]["due_at"] is not None)
post(lawyer, f"/api/tasks/{tasks[0]['id']}/approve", {"comment": "Замечаний нет"})

director = login("director")
tasks_d = client.get("/api/tasks/my", headers=director).json()
check("После визы юриста активирован этап директора", len(tasks_d) == 1,
      f"получено {len(tasks_d)}")
post(director, f"/api/tasks/{tasks_d[0]['id']}/approve", {})

process = client.get(f"/api/processes/{process_id}", headers=engineer).json()
check("Процесс согласован (APPROVED)", process["status"] == "APPROVED",
      process["status"])
check("route_snapshot сохранён", bool(process["route_snapshot"]["stages"]))
actions = [a["action"] for a in process["audit"]]
check("Аудит: старт, 2 визы, завершение",
      actions == ["PROCESS_STARTED", "TASK_APPROVED", "TASK_APPROVED", "PROCESS_APPROVED"],
      str(actions))

# --- Сценарий 2: отклонение ---
memo2 = new_doc(engineer, "Командировка", "Прошу направить в командировку.")
memo2 = post(engineer, f"/api/documents/{memo2['id']}/submit", {})
tasks2 = client.get("/api/tasks/my", headers=lawyer).json()
resp = client.post(f"/api/tasks/{tasks2[0]['id']}/reject", json={}, headers=lawyer)
check("Отклонение без комментария запрещено", resp.status_code == 422)
post(lawyer, f"/api/tasks/{tasks2[0]['id']}/reject", {"comment": "Нет обоснования"})
process2 = client.get(f"/api/processes/{memo2['process']['id']}", headers=engineer).json()
check("Процесс отклонён (REJECTED)", process2["status"] == "REJECTED")
director_tasks_after = client.get("/api/tasks/my", headers=director).json()
check("Задачи директора по отклонённому процессу сняты",
      all(t["process_id"] != memo2["process"]["id"] for t in director_tasks_after))

# --- Проверки доступов ---
resp = client.get(f"/api/processes/{process_id}", headers=login("director"))
check("Согласующий видит карточку процесса", resp.status_code == 200)
resp = client.post("/api/admin/organizations", json={"name": "x"}, headers=engineer)
check("Не-админу закрыт админ-CRUD", resp.status_code == 403, str(resp.status_code))
resp = client.post("/api/documents", json={
    "type_code": "MEMO", "subject": "x", "body": "y",
    "organization_id": org["id"], "project_id": project["id"],
}, headers=admin)
check("Несопоставленный пользователь не может создать заявку (ТЗ §3.5)",
      resp.status_code == 403, str(resp.status_code))

print()
if FAILURES:
    print(f"ПРОВАЛЕНО: {len(FAILURES)}: {FAILURES}")
    sys.exit(1)
print("Все проверки пройдены.")
