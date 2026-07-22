export type ProcessStatus =
  | 'DRAFT' | 'IN_PROGRESS' | 'REJECTED' | 'APPROVED'
  | 'PENDING_EXPORT' | 'EXPORTED' | 'CANCELLED' | 'FORCE_CLOSED'

export type TaskStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED'
export type TaskResult = 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED'

export interface User {
  id: string
  ad_sam_account_name: string
  display_name: string | null
  email: string | null
  status: 'ACTIVE' | 'DISABLED'
  roles: string[]
  employee_id: string | null
}

export interface ProcessBrief {
  id: string
  status: ProcessStatus
  started_at: string | null
  completed_at: string | null
}

export interface Memo {
  id: string
  number: string
  date: string
  organization_id: string | null
  organization_name: string | null
  project_id: string | null
  project_name: string | null
  subject: string
  body: string
  department_id: string | null
  author_id: string | null
  author_name: string | null
  created_at: string
  process: ProcessBrief | null
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
  position_id: string | null
  assignee_id: string
  assignee_name: string | null
  substitute_for_id: string | null
  status: TaskStatus
  result: TaskResult | null
  comment: string | null
  due_at: string | null
  completed_at: string | null
}

export interface MyTask extends Task {
  object_type: string | null
  subject: string | null
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
  status: ProcessStatus
  route_snapshot: { stages: RouteStageSnapshot[] } | null
  started_at: string | null
  completed_at: string | null
  subject: string | null
  tasks: Task[]
  audit: AuditEntry[]
}
