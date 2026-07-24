import { useEffect, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'
import { useLocalizeName } from '../i18n/localize'
import { InfoCell, InfoGrid } from './InfoGrid'
import type {
  ContractRef,
  CounterpartyRef,
  DictionaryRef,
  EmployeeRef,
  OrganizationRef,
  ProjectRef,
  TypeColumn,
  TypeField,
  VatRateRef,
} from '../api/types'

/** Данные справочников для ссылочных полей. */
export interface RefsData {
  employees: EmployeeRef[]
  organizations: OrganizationRef[]
  projects: ProjectRef[]
  dictionaries: DictionaryRef[]
  counterparties: CounterpartyRef[]
  contracts: ContractRef[]
  vatRates: VatRateRef[]
}

export function useRefsData(enabled: boolean): RefsData {
  const [data, setData] = useState<RefsData>({
    employees: [],
    organizations: [],
    projects: [],
    dictionaries: [],
    counterparties: [],
    contracts: [],
    vatRates: [],
  })
  useEffect(() => {
    if (!enabled) return
    Promise.all([
      api<EmployeeRef[]>('/api/refs/employees'),
      api<OrganizationRef[]>('/api/refs/organizations'),
      api<ProjectRef[]>('/api/refs/projects'),
      api<DictionaryRef[]>('/api/refs/dictionaries'),
      api<CounterpartyRef[]>('/api/refs/counterparties'),
      api<ContractRef[]>('/api/refs/contracts'),
      api<VatRateRef[]>('/api/refs/vat-rates'),
    ]).then(([employees, organizations, projects, dictionaries, counterparties, contracts, vatRates]) =>
      setData({ employees, organizations, projects, dictionaries, counterparties, contracts, vatRates }),
    )
  }, [enabled])
  return data
}

/** Варианты ссылочного поля/колонки по ref_target. */
export function refOptions(
  ref: Pick<TypeField | TypeColumn, 'ref_target' | 'dictionary_id'>,
  refs: RefsData,
): { id: string; name: string }[] {
  switch (ref.ref_target) {
    case 'EMPLOYEE':
      return refs.employees.map((e) => ({ id: e.id, name: e.full_name }))
    case 'ORGANIZATION':
      return refs.organizations
    case 'PROJECT':
      return refs.projects.map((p) => ({ id: p.id, name: p.name }))
    case 'DICTIONARY':
      return refs.dictionaries.find((d) => d.id === ref.dictionary_id)?.items ?? []
    case 'COUNTERPARTY':
      return refs.counterparties.map((c) => ({ id: c.id, name: c.name }))
    case 'CONTRACT':
      return refs.contracts.map((c) => ({ id: c.id, name: c.number ?? c.id }))
    case 'VAT_RATE':
      return refs.vatRates.map((v) => ({ id: v.id, name: v.name }))
    default:
      return []
  }
}

type ScalarDef = Pick<
  TypeField | TypeColumn,
  'field_type' | 'ref_target' | 'dictionary_id'
>

export function customFieldDisplay(
  field: ScalarDef,
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

/** Ввод одной ячейки табличной части по типу колонки. */
function CellInput({
  col, value, onChange, disabled, refs,
}: {
  col: TypeColumn
  value: unknown
  onChange: (v: unknown) => void
  disabled: boolean
  refs: RefsData
}) {
  const common = { size: 'small' as const, fullWidth: true, disabled }
  if (col.field_type === 'BOOLEAN') {
    return (
      <Checkbox
        size="small"
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  }
  if (col.field_type === 'REF') {
    return (
      <TextField
        {...common}
        select
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <MenuItem value="">—</MenuItem>
        {refOptions(col, refs).map((o) => (
          <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
        ))}
      </TextField>
    )
  }
  const type =
    col.field_type === 'DATE'
      ? 'date'
      : col.field_type === 'NUMBER' || col.field_type === 'MONEY'
        ? 'number'
        : 'text'
  return (
    <TextField
      {...common}
      type={type}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined}
    />
  )
}

/** Табличная часть — ввод строк (add/remove). */
function TableFieldInput({
  field, value, onChange, disabled, refs,
}: {
  field: TypeField
  value: unknown
  onChange: (rows: Record<string, unknown>[]) => void
  disabled: boolean
  refs: RefsData
}) {
  const columns = field.columns ?? []
  const rows: Record<string, unknown>[] = Array.isArray(value) ? value : []
  const updateCell = (i: number, code: string, v: unknown) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [code]: v } : r)))
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {field.name}{field.required ? ' *' : ''}
      </Typography>
      <Table size="small" sx={{ '& td, & th': { px: 1 } }}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.code}>{c.name}</TableCell>
            ))}
            {!disabled && <TableCell width={44} />}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.code} sx={{ verticalAlign: 'top' }}>
                  <CellInput
                    col={c}
                    value={row[c.code]}
                    onChange={(v) => updateCell(i, c.code, v)}
                    disabled={disabled}
                    refs={refs}
                  />
                </TableCell>
              ))}
              {!disabled && (
                <TableCell>
                  <IconButton size="small" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!disabled && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...rows, {}])}>
          Добавить строку
        </Button>
      )}
    </Box>
  )
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
  const localizeName = useLocalizeName()
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
          case 'TABLE':
            return (
              <Box key={field.id} sx={{ gridColumn: '1 / -1' }}>
                <TableFieldInput
                  field={field}
                  value={value}
                  onChange={(rows) => set(field.code, rows)}
                  disabled={disabled}
                  refs={refs}
                />
              </Box>
            )
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
                label={localizeName(field.name, field.name_i18n)}
              />
            )
          case 'REF':
            return (
              <TextField
                key={field.id}
                select
                label={localizeName(field.name, field.name_i18n)}
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
                label={localizeName(field.name, field.name_i18n)}
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
                label={localizeName(field.name, field.name_i18n)}
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
  const localizeName = useLocalizeName()
  if (fields.length === 0) return null
  const scalarFields = fields.filter((f) => f.field_type !== 'TABLE')
  const tableFields = fields.filter((f) => f.field_type === 'TABLE')
  return (
    <>
      {scalarFields.length > 0 && (
        <InfoGrid>
          {scalarFields.map((field) => (
            <InfoCell
              key={field.id}
              label={localizeName(field.name, field.name_i18n)}
              value={customFieldDisplay(field, values[field.code], refs)}
              span={field.field_type === 'TEXT'}
            />
          ))}
        </InfoGrid>
      )}
      {tableFields.map((field) => {
        const columns = field.columns ?? []
        const rows: Record<string, unknown>[] = Array.isArray(values[field.code])
          ? (values[field.code] as Record<string, unknown>[])
          : []
        return (
          <Box key={field.id} sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{field.name}</Typography>
            <Table size="small" sx={{ '& td, & th': { px: 1 } }}>
              <TableHead>
                <TableRow>
                  {columns.map((c) => <TableCell key={c.code}>{c.name}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} sx={{ color: 'text.secondary' }}>
                      Строк нет
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((c) => (
                        <TableCell key={c.code}>
                          {customFieldDisplay(c, row[c.code], refs)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        )
      })}
    </>
  )
}
