import { Navigate, useParams } from 'react-router-dom'
import { CrudTable } from '../components/CrudTable'
import type { EntityConfig } from '../components/CrudTable'
import { useAuth } from '../auth'

const OBJECT_TYPES = [
  { value: 'MEMO', label: 'Служебная записка' },
  { value: 'CONTRACT_REQUEST', label: 'Заявка на договор' },
  { value: 'PAYMENT_REQUEST', label: 'Заявка на оплату' },
]

const RESOLVER_TYPES = [
  { value: 'POSITION_IN_ORG', label: 'Должность в организации' },
  { value: 'POSITION_IN_PROJECT', label: 'Должность в проекте' },
  { value: 'INITIATOR', label: 'Инициатор' },
  { value: 'INITIATOR_MANAGER', label: 'Руководитель инициатора' },
  { value: 'PROJECT_MANAGER', label: 'Руководитель проекта' },
]

const STAGE_TYPES = [
  { value: 'SEQUENTIAL', label: 'Последовательно' },
  { value: 'PARALLEL_ALL', label: 'Параллельно — все' },
  { value: 'PARALLEL_ANY', label: 'Параллельно — любой' },
  { value: 'QUORUM', label: 'Кворум N из M' },
]

const MANDATORY = [
  { value: 'REQUIRED', label: 'Обязательно' },
  { value: 'OPTIONAL', label: 'Опционально' },
  { value: 'SKIP_IF_NO_ASSIGNEE', label: 'Пропустить, если нет исполнителя' },
]

const ROLES = [
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'INITIATOR', label: 'Инициатор' },
  { value: 'OBSERVER', label: 'Наблюдатель' },
  { value: 'MATRIX_EDITOR', label: 'Настройщик матрицы' },
]

const ABSENCE_TYPES = [
  { value: 'VACATION', label: 'Отпуск' },
  { value: 'SICK_LEAVE', label: 'Больничный' },
  { value: 'OTHER', label: 'Прочее' },
]

const EMPLOYEE_STATUSES = [
  { value: 'ACTIVE', label: 'Работает' },
  { value: 'TERMINATED', label: 'Уволен' },
]

const ORG = { optionsUrl: '/api/admin/organizations', optionLabel: 'name' }
const POS = { optionsUrl: '/api/admin/positions', optionLabel: 'name' }
const EMP = { optionsUrl: '/api/admin/employees', optionLabel: 'full_name' }
const PROJ = { optionsUrl: '/api/admin/projects', optionLabel: 'name' }

export const ENTITIES: Record<string, EntityConfig> = {
  organizations: {
    title: 'Организации',
    endpoint: '/api/admin/organizations',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'bin', label: 'БИН' },
      { key: 'active', label: 'Активна', type: 'checkbox' },
    ],
  },
  positions: {
    title: 'Должности',
    endpoint: '/api/admin/positions',
    hint: 'Должность = роль в маршрутах согласования',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'active', label: 'Активна', type: 'checkbox' },
    ],
  },
  departments: {
    title: 'Подразделения',
    endpoint: '/api/admin/departments',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'organization_id', label: 'Организация', ...ORG },
      { key: 'parent_id', label: 'Родитель', optionsUrl: '/api/admin/departments', optionLabel: 'name' },
    ],
  },
  employees: {
    title: 'Сотрудники',
    endpoint: '/api/admin/employees',
    fields: [
      { key: 'full_name', label: 'ФИО', required: true },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Статус', options: EMPLOYEE_STATUSES },
    ],
  },
  employments: {
    title: 'Трудоустройства',
    endpoint: '/api/admin/employments',
    hint: 'Кто, где и кем работает — по этим записям матрица находит исполнителей',
    fields: [
      { key: 'employee_id', label: 'Сотрудник', required: true, ...EMP, editable: false },
      { key: 'organization_id', label: 'Организация', required: true, ...ORG, editable: false },
      { key: 'position_id', label: 'Должность', required: true, ...POS, editable: false },
      { key: 'department_id', label: 'Подразделение', optionsUrl: '/api/admin/departments', optionLabel: 'name' },
      { key: 'is_primary', label: 'Основное', type: 'checkbox' },
      { key: 'valid_from', label: 'С', type: 'date', inTable: false },
      { key: 'valid_to', label: 'По', type: 'date', inTable: false },
    ],
  },
  absences: {
    title: 'Отсутствия',
    endpoint: '/api/admin/absences',
    fields: [
      { key: 'employee_id', label: 'Сотрудник', required: true, ...EMP },
      { key: 'date_from', label: 'С', type: 'date', required: true },
      { key: 'date_to', label: 'По', type: 'date', required: true },
      { key: 'type', label: 'Вид', options: ABSENCE_TYPES, required: true },
    ],
  },
  substitutions: {
    title: 'Замещения',
    endpoint: '/api/admin/substitutions',
    hint: 'Если сотрудник отсутствует, его задачи получает заместитель',
    fields: [
      { key: 'employee_id', label: 'Кого замещают', required: true, ...EMP },
      { key: 'substitute_id', label: 'Заместитель', required: true, ...EMP },
      { key: 'valid_from', label: 'С', type: 'date', required: true },
      { key: 'valid_to', label: 'По', type: 'date', required: true },
    ],
  },
  projects: {
    title: 'Проекты',
    endpoint: '/api/admin/projects',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'code', label: 'Код' },
      { key: 'organization_id', label: 'Организация', ...ORG },
      { key: 'status', label: 'Статус' },
    ],
  },
  'project-assignments': {
    title: 'Назначения на проекты',
    endpoint: '/api/admin/project-assignments',
    fields: [
      { key: 'project_id', label: 'Проект', required: true, ...PROJ },
      { key: 'position_id', label: 'Должность', required: true, ...POS },
      { key: 'employee_id', label: 'Сотрудник', required: true, ...EMP },
      { key: 'valid_from', label: 'С', type: 'date', inTable: false },
      { key: 'valid_to', label: 'По', type: 'date', inTable: false },
    ],
  },
  'route-rules': {
    title: 'Матрица согласования',
    endpoint: '/api/admin/route-rules',
    hint: 'Одна строка — один участник этапа. Тип этапа общий: изменение применяется ко всем участникам этапа. Пустая организация/проект = «любой». При конфликте побеждает группа с наименьшим приоритетом.',
    fields: [
      { key: 'object_type', label: 'Вид объекта', options: OBJECT_TYPES, required: true },
      { key: 'organization_id', label: 'Организация', ...ORG },
      { key: 'project_id', label: 'Проект', ...PROJ },
      { key: 'stage_no', label: 'Этап', type: 'number', required: true },
      { key: 'resolver_type', label: 'Адресация', options: RESOLVER_TYPES, required: true },
      { key: 'position_id', label: 'Должность', ...POS },
      { key: 'stage_type', label: 'Тип этапа', options: STAGE_TYPES },
      { key: 'quorum_count', label: 'Кворум', type: 'number', inTable: false },
      { key: 'deadline_hours', label: 'Срок, ч', type: 'number' },
      { key: 'mandatory', label: 'Обязательность', options: MANDATORY, inTable: false },
      { key: 'priority', label: 'Приоритет', type: 'number', required: true },
      { key: 'valid_from', label: 'Действует с', type: 'date', inTable: false },
      { key: 'valid_to', label: 'Действует по', type: 'date', inTable: false },
    ],
  },
  users: {
    title: 'Пользователи',
    endpoint: '/api/admin/users',
    canDelete: false,
    hint: 'Пользователь без привязки к сотруднику не может создавать заявки',
    fields: [
      { key: 'ad_sam_account_name', label: 'Логин', inForm: false },
      { key: 'username', label: 'Логин', inTable: false, required: true, editable: false },
      { key: 'display_name', label: 'Отображаемое имя' },
      { key: 'email', label: 'Email', inTable: false },
      { key: 'employee_id', label: 'Сотрудник', ...EMP },
      { key: 'roles', label: 'Роли', type: 'multiselect', options: ROLES, required: true },
      {
        key: 'status', label: 'Статус', inForm: true,
        options: [
          { value: 'ACTIVE', label: 'Активен' },
          { value: 'DISABLED', label: 'Отключён' },
        ],
      },
    ],
  },
}

export function AdminPage() {
  const { entity } = useParams()
  const { user } = useAuth()

  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const isMatrixEditor = isAdmin || (user?.roles.includes('MATRIX_EDITOR') ?? false)

  if (!entity || !ENTITIES[entity]) return <Navigate to="/admin/organizations" replace />
  if (!isAdmin && !(entity === 'route-rules' && isMatrixEditor)) {
    return <Navigate to="/tasks" replace />
  }

  // навигация по разделам — в боковом меню (Справочники / Администрирование)
  return <CrudTable config={ENTITIES[entity]} />
}
