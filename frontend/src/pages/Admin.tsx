import { Navigate, useParams } from 'react-router-dom'
import { CrudTable } from '../components/CrudTable'
import type { EntityConfig } from '../components/CrudTable'
import { AuditPage } from './Audit'
import { DictionariesPage } from './Dictionaries'
import { ErrorsPage } from './Errors'
import { ExchangePage } from './Exchange'
import { DocumentTypesPage } from './DocumentTypes'
import { OverduePage } from './Overdue'
import { RouteMatrixPage } from './RouteMatrix'
import { useAuth } from '../auth'

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

const CONTRACT_TYPES = [
  { value: 'WORK', label: 'Договор подряда' },
  { value: 'SUPPLY', label: 'Договор поставки' },
  { value: 'SERVICE', label: 'Договор оказания услуг' },
]

const ORG = { optionsUrl: '/api/admin/organizations', optionLabel: 'name' }
const POS = { optionsUrl: '/api/admin/positions', optionLabel: 'name' }
const EMP = { optionsUrl: '/api/admin/employees', optionLabel: 'full_name' }
const PROJ = { optionsUrl: '/api/admin/projects', optionLabel: 'name' }
const CPARTY = { optionsUrl: '/api/admin/counterparties', optionLabel: 'name' }
const VAT = { optionsUrl: '/api/admin/vat-rates', optionLabel: 'name' }

export const ENTITIES: Record<string, EntityConfig> = {
  organizations: {
    title: 'Организации',
    endpoint: '/api/admin/organizations',
    exchangeEntity: 'ORGANIZATION',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'full_name', label: 'Полное наименование', inTable: false },
      { key: 'inn', label: 'ИНН' },
      { key: 'legal_address', label: 'Юридический адрес', inTable: false },
      { key: 'phone', label: 'Телефон', inTable: false },
      { key: 'email', label: 'Эл. адрес', inTable: false },
      { key: 'active', label: 'Активна', type: 'checkbox' },
    ],
  },
  positions: {
    title: 'Должности',
    endpoint: '/api/admin/positions',
    hint: 'Должность = роль в маршрутах согласования',
    exchangeEntity: 'POSITION',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'active', label: 'Активна', type: 'checkbox' },
    ],
  },
  departments: {
    title: 'Подразделения',
    endpoint: '/api/admin/departments',
    exchangeEntity: 'DEPARTMENT',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'organization_id', label: 'Организация', ...ORG },
      { key: 'parent_id', label: 'Родитель', optionsUrl: '/api/admin/departments', optionLabel: 'name' },
      { key: 'active', label: 'Активно', type: 'checkbox' },
    ],
  },
  employees: {
    title: 'Сотрудники',
    endpoint: '/api/admin/employees',
    exchangeEntity: 'EMPLOYEE',
    fields: [
      { key: 'full_name', label: 'ФИО', required: true },
      { key: 'pinfl', label: 'ПИНФЛ' },
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
    exchangeEntity: 'ABSENCE',
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
    exchangeEntity: 'PROJECT',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'code', label: 'Код' },
      { key: 'organization_id', label: 'Организация', ...ORG },
      { key: 'status', label: 'Статус' },
      { key: 'active', label: 'Активен', type: 'checkbox' },
    ],
  },
  counterparties: {
    title: 'Контрагенты',
    endpoint: '/api/admin/counterparties',
    hint: 'Обмен с 1С:БУХ — можно создавать в BPM. Удаления нет, только деактивация',
    exchangeEntity: 'COUNTERPARTY',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'full_name', label: 'Полное наименование', inTable: false },
      { key: 'inn', label: 'ИНН' },
      { key: 'address', label: 'Юридический адрес', inTable: false },
      { key: 'phone', label: 'Телефон', inTable: false },
      { key: 'email', label: 'Эл. адрес', inTable: false },
      { key: 'active', label: 'Активен', type: 'checkbox' },
    ],
  },
  contracts: {
    title: 'Договоры',
    endpoint: '/api/admin/contracts',
    hint: 'Обмен с 1С:БУХ — можно создавать в BPM. Удаления нет, только деактивация',
    exchangeEntity: 'CONTRACT',
    fields: [
      { key: 'number', label: 'Номер' },
      { key: 'date', label: 'Дата', type: 'date' },
      { key: 'contract_type', label: 'Вид договора', options: CONTRACT_TYPES },
      { key: 'counterparty_id', label: 'Контрагент', required: true, ...CPARTY },
      { key: 'organization_id', label: 'Организация', required: true, ...ORG },
      { key: 'project_id', label: 'Проект', ...PROJ, inTable: false },
      { key: 'valid_from', label: 'Начало действия', type: 'date', inTable: false },
      { key: 'valid_to', label: 'Окончание действия', type: 'date', inTable: false },
      { key: 'amount', label: 'Сумма', type: 'number', inTable: false },
      { key: 'vat_rate_id', label: 'Ставка НДС', ...VAT, inTable: false },
      { key: 'currency', label: 'Валюта', inTable: false },
      { key: 'responsible_id', label: 'Ответственный', ...EMP, inTable: false },
      { key: 'active', label: 'Активен', type: 'checkbox' },
    ],
  },
  'vat-rates': {
    title: 'Ставки НДС',
    endpoint: '/api/admin/vat-rates',
    hint: 'Справочник ставок НДС для договоров и заявок',
    fields: [
      { key: 'name', label: 'Наименование', required: true },
      { key: 'rate', label: 'Ставка, %', type: 'number' },
      { key: 'sort_order', label: 'Порядок', type: 'number', inTable: false },
      { key: 'active', label: 'Активна', type: 'checkbox' },
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
  users: {
    title: 'Пользователи',
    endpoint: '/api/admin/users',
    canDelete: false,
    hint: 'Пользователь без привязки к сотруднику не может создавать заявки. '
      + 'Email обязателен — на него уходят уведомления и письма согласования',
    fields: [
      { key: 'ad_sam_account_name', label: 'Логин', inForm: false },
      { key: 'username', label: 'Логин', inTable: false, required: true, editable: false },
      { key: 'display_name', label: 'Отображаемое имя' },
      // без email не работают уведомления и согласование по почте
      { key: 'email', label: 'Email', inTable: false, required: true },
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

  if (entity === 'route-rules') {
    if (!isMatrixEditor) return <Navigate to="/tasks" replace />
    return <RouteMatrixPage />
  }
  if (entity === 'document-types') {
    if (!isAdmin) return <Navigate to="/tasks" replace />
    return <DocumentTypesPage />
  }
  if (entity === 'dictionaries') {
    if (!isAdmin) return <Navigate to="/tasks" replace />
    return <DictionariesPage />
  }
  if (entity === 'overdue') {
    if (!isAdmin) return <Navigate to="/tasks" replace />
    return <OverduePage />
  }
  if (entity === 'audit') {
    if (!isAdmin) return <Navigate to="/tasks" replace />
    return <AuditPage />
  }
  if (entity === 'errors') {
    if (!isAdmin) return <Navigate to="/tasks" replace />
    return <ErrorsPage />
  }
  if (entity === 'exchange') {
    if (!isAdmin) return <Navigate to="/tasks" replace />
    return <ExchangePage />
  }
  if (!entity || !ENTITIES[entity]) return <Navigate to="/admin/organizations" replace />
  if (!isAdmin) return <Navigate to="/tasks" replace />

  // навигация по разделам — в боковом меню (Справочники / Администрирование)
  return <CrudTable config={ENTITIES[entity]} />
}
