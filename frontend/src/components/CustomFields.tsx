import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { api } from '../api/client'
import { InfoCell, InfoGrid } from './InfoGrid'
import type {
  DictionaryRef,
  EmployeeRef,
  OrganizationRef,
  ProjectRef,
  TypeField,
} from '../api/types'

/** Данные справочников для ссылочных полей. */
export interface RefsData {
  employees: EmployeeRef[]
  organizations: OrganizationRef[]
  projects: ProjectRef[]
  dictionaries: DictionaryRef[]
}

export function useRefsData(enabled: boolean): RefsData {
  const [data, setData] = useState<RefsData>({
    employees: [],
    organizations: [],
    projects: [],
    dictionaries: [],
  })
  useEffect(() => {
    if (!enabled) return
    Promise.all([
      api<EmployeeRef[]>('/api/refs/employees'),
      api<OrganizationRef[]>('/api/refs/organizations'),
      api<ProjectRef[]>('/api/refs/projects'),
      api<DictionaryRef[]>('/api/refs/dictionaries'),
    ]).then(([employees, organizations, projects, dictionaries]) =>
      setData({ employees, organizations, projects, dictionaries }),
    )
  }, [enabled])
  return data
}

export function refOptions(
  field: TypeField,
  refs: RefsData,
): { id: string; name: string }[] {
  switch (field.ref_target) {
    case 'EMPLOYEE':
      return refs.employees.map((e) => ({ id: e.id, name: e.full_name }))
    case 'ORGANIZATION':
      return refs.organizations
    case 'PROJECT':
      return refs.projects.map((p) => ({ id: p.id, name: p.name }))
    case 'DICTIONARY':
      return refs.dictionaries.find((d) => d.id === field.dictionary_id)?.items ?? []
    default:
      return []
  }
}

export function customFieldDisplay(
  field: TypeField,
  value: unknown,
  refs: RefsData,
): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (field.field_type) {
    case 'BOOLEAN':
      return value ? 'Да' : 'Нет'
    case 'DATE':
      return new Date(String(value)).toLocaleDateString('ru-RU')
    case 'MONEY':
      return Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
    case 'REF':
      return refOptions(field, refs).find((o) => o.id === value)?.name ?? String(value)
    default:
      return String(value)
  }
}

/** Поля ввода настраиваемых полей вида документа (динамическая форма). */
export function CustomFieldInputs({
  fields,
  values,
  onChange,
  disabled,
  refs,
}: {
  fields: TypeField[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
  disabled: boolean
  refs: RefsData
}) {
  if (fields.length === 0) return null
  const set = (code: string, value: unknown) => onChange({ ...values, [code]: value })

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        alignItems: 'center',
        gridTemplateColumns:
          'repeat(auto-fill, minmax(max(230px, calc(25% - 16px)), 1fr))',
      }}
    >
      {fields.map((field) => {
        const value = values[field.code]
        switch (field.field_type) {
          case 'BOOLEAN':
            return (
              <FormControlLabel
                key={field.id}
                control={
                  <Checkbox
                    checked={Boolean(value)}
                    disabled={disabled}
                    onChange={(e) => set(field.code, e.target.checked)}
                  />
                }
                label={field.name}
              />
            )
          case 'REF':
            return (
              <TextField
                key={field.id}
                select
                label={field.name}
                required={field.required}
                disabled={disabled}
                value={value == null ? '' : String(value)}
                onChange={(e) => set(field.code, e.target.value || null)}
              >
                <MenuItem value="">—</MenuItem>
                {refOptions(field, refs).map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.name}
                  </MenuItem>
                ))}
              </TextField>
            )
          case 'TEXT':
            return (
              <TextField
                key={field.id}
                label={field.name}
                required={field.required}
                disabled={disabled}
                multiline
                minRows={3}
                sx={{ gridColumn: '1 / -1' }}
                value={value == null ? '' : String(value)}
                onChange={(e) => set(field.code, e.target.value)}
              />
            )
          default:
            return (
              <TextField
                key={field.id}
                label={field.name}
                required={field.required}
                disabled={disabled}
                type={
                  field.field_type === 'DATE'
                    ? 'date'
                    : field.field_type === 'NUMBER' || field.field_type === 'MONEY'
                      ? 'number'
                      : 'text'
                }
                value={value == null ? '' : String(value)}
                onChange={(e) => set(field.code, e.target.value)}
                slotProps={
                  field.field_type === 'DATE'
                    ? { inputLabel: { shrink: true } }
                    : undefined
                }
              />
            )
        }
      })}
    </Box>
  )
}

/** Значения настраиваемых полей — только чтение (карточка документа). */
export function CustomFieldValues({
  fields,
  values,
  refs,
}: {
  fields: TypeField[]
  values: Record<string, unknown>
  refs: RefsData
}) {
  if (fields.length === 0) return null
  return (
    <InfoGrid>
      {fields.map((field) => (
        <InfoCell
          key={field.id}
          label={field.name}
          value={customFieldDisplay(field, values[field.code], refs)}
          span={field.field_type === 'TEXT'}
        />
      ))}
    </InfoGrid>
  )
}
