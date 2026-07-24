export type ProcessStatus =
  | 'DRAFT' | 'IN_PROGRESS' | 'RETURNED' | 'REJECTED' | 'APPROVED'
  | 'PENDING_EXPORT' | 'EXPORTED' | 'CANCELLED' | 'FORCE_CLOSED'

export type TaskStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED'
export type TaskResult =
  | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED' | 'EXECUTED' | 'ACKNOWLEDGED'
  | 'RETURNED'
export type TaskKind = 'APPROVAL' | 'EXECUTION' | 'ACKNOWLEDGEMENT'

export interface User {
  id: string
  ad_sam_account_name: string
  display_name: string | null
  email: string | null
  status: 'ACTIVE' | 'DISABLED'
  roles: string[]
  employee_id: string | null
  locale: string
  theme: string
}

export interface ProcessBrief {
  id: string
  status: ProcessStatus
  started_at: string | null
  completed_at: string | null
}

export interface DocumentItem {
  id: string
  type_code: string
  number: string
  date: string
  organization_id: string | null
  organization_name: string | null
  project_id: string | null
  project_name: string | null
  subject: string
  body: string
  custom_fields: Record<string, unknown>
  department_id: string | null
  author_id: string | null
  author_name: string | null
  created_at: string
  process: ProcessBrief | null
}

export interface TypeField {
  id: string
  code: string
  name: string
  field_type: string
  ref_target: string | null
  dictionary_id: string | null
  required: boolean
  sort_order: number
}

export interface DocumentTypeRef {
  id: string
  code: string
  name: string
  prefix: string
  is_system: boolean
  fields: TypeField[]
}

export interface EmployeeRef {
  id: string
  full_name: string
}

export interface DictionaryRef {
  id: string
  name: string
  items: { id: string; name: string }[]
}

export interface OrganizationRef {
  id: string
  name: string
}

export interface ProjectRef {
  id: string
  name: string
  code: string | null
  organization_id: string | null
}

export interface Attachment {
  id: string
  filename: string
  content_type: string | null
  size_bytes: number
  created_at: string
}

export interface Task {
  id: string
  process_id: string
  stage_no: number
  order_in_stage: number
  task_kind: TaskKind
  position_id: string | null
  assignee_id: string
  assignee_name: string | null
  substitute_for_id: string | null
  status: TaskStatus
  result: TaskResult | null
  comment: string | null
  due_at: string | null
  escalated_at: string | null
  completed_at: string | null
}

export interface MyTask extends Task {
  object_type: string | null
  subject: string | null
  doc_number: string | null
  initiator_name: string | null
  process_started_at: string | null
}

export interface AuditEntry {
  id: string
  task_id: string | null
  user_id: string | null
  user_name: string | null
  action: string
  payload: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export interface RouteSlotSnapshot {
  order_in_stage: number
  task_kind?: TaskKind
  resolver_type: string
  position_id: string | null
  position_name: string | null
  mandatory: string
  deadline_hours: number | null
  assignees: {
    employee_id: string
    full_name: string
    substitute_for_id: string | null
    substitute_for_name: string | null
  }[]
  skipped: boolean
}

export interface RouteStageSnapshot {
  stage_no: number
  stage_type: string
  quorum_count: number | null
  slots: RouteSlotSnapshot[]
}

export interface AnalyticsSummary {
  processes: {
    total: number
    by_status: Record<string, number>
    started_30d: number
    completed_30d: number
  }
  tasks: {
    active: number
    active_overdue: number
    completed_with_deadline: number
    on_time_rate: number | null
  }
  cycle_time: {
    object_type: string
    label: string
    avg_hours: number
    count: number
  }[]
  bottlenecks: {
    position_id: string | null
    position_name: string
    count: number
    avg_hours: number
    overdue: number
  }[]
}

export interface Process {
  id: string
  object_type: string
  object_id: string
  initiator_id: string
  initiator_name: string | null
  organization_id: string
  organization_name: string | null
  project_id: string | null
  project_name: string | null
  doc_number: string | null
  doc_date: string | null
  doc_body: string | null
  status: ProcessStatus
  route_snapshot: { stages: RouteStageSnapshot[] } | null
  started_at: string | null
  completed_at: string | null
  subject: string | null
  tasks: Task[]
  audit: AuditEntry[]
}
