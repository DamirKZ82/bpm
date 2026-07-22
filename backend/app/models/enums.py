from enum import StrEnum


class ObjectType(StrEnum):
    """Виды согласуемых объектов (ТЗ §4.1)."""

    MEMO = "MEMO"                          # служебная записка
    CONTRACT_REQUEST = "CONTRACT_REQUEST"  # заявка на договор
    PAYMENT_REQUEST = "PAYMENT_REQUEST"    # заявка на оплату


class ResolverType(StrEnum):
    """Способы адресации исполнителя (ТЗ §4.2)."""

    POSITION_IN_ORG = "POSITION_IN_ORG"
    POSITION_IN_PROJECT = "POSITION_IN_PROJECT"
    INITIATOR = "INITIATOR"
    INITIATOR_MANAGER = "INITIATOR_MANAGER"
    PROJECT_MANAGER = "PROJECT_MANAGER"


class StageType(StrEnum):
    SEQUENTIAL = "SEQUENTIAL"
    PARALLEL_ALL = "PARALLEL_ALL"
    PARALLEL_ANY = "PARALLEL_ANY"
    QUORUM = "QUORUM"


class RuleMandatory(StrEnum):
    """Обязательность строки маршрута (ТЗ §4.1)."""

    REQUIRED = "REQUIRED"
    OPTIONAL = "OPTIONAL"
    SKIP_IF_NO_ASSIGNEE = "SKIP_IF_NO_ASSIGNEE"


class ProcessStatus(StrEnum):
    """Статусы процесса (ТЗ §6.2). PENDING_EXPORT — отдельный статус,
    иначе сценарий «согласовано, выгрузка упала» невидим."""

    DRAFT = "DRAFT"
    IN_PROGRESS = "IN_PROGRESS"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"
    PENDING_EXPORT = "PENDING_EXPORT"
    EXPORTED = "EXPORTED"
    CANCELLED = "CANCELLED"
    FORCE_CLOSED = "FORCE_CLOSED"


class TaskStatus(StrEnum):
    PENDING = "PENDING"      # этап ещё не наступил
    ACTIVE = "ACTIVE"        # ожидает решения
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"      # опциональный без исполнителя / совпадение (ТЗ §5.2)
    CANCELLED = "CANCELLED"  # процесс отозван/закрыт


class TaskResult(StrEnum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    AUTO_APPROVED = "AUTO_APPROVED"  # совпадение с инициатором/предыдущим этапом


class UserRole(StrEnum):
    """Роли хранятся в BPM, не в группах AD (ТЗ §3.6).
    «Согласующий» — не роль, а факт наличия задачи."""

    ADMIN = "ADMIN"
    INITIATOR = "INITIATOR"
    OBSERVER = "OBSERVER"          # видит процессы своей организации, без действий
    MATRIX_EDITOR = "MATRIX_EDITOR"  # правит маршруты, не участвует в согласовании


class EmployeeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    TERMINATED = "TERMINATED"  # уволен в ЗУП; запись не удаляется никогда (ТЗ §7.3)


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"  # userAccountControl бит 2 в AD (ТЗ §3.3)


class AbsenceType(StrEnum):
    VACATION = "VACATION"
    SICK_LEAVE = "SICK_LEAVE"
    OTHER = "OTHER"


class CounterpartySyncStatus(StrEnum):
    """Статусы контрагента (ТЗ §8.5)."""

    DRAFT = "DRAFT"
    PENDING = "PENDING"
    SYNCED = "SYNCED"
    FAILED = "FAILED"
    IMPORTED = "IMPORTED"


class ContractSyncStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    SYNCED = "SYNCED"
    FAILED = "FAILED"


class ExternalSystem(StrEnum):
    ZUP = "ZUP"
    BUH = "BUH"
    AD = "AD"


class OutboxStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    ACKED = "ACKED"
    FAILED = "FAILED"


class SyncDirection(StrEnum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
