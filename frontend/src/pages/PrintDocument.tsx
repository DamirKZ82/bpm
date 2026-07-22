import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import type {
  DocumentItem,
  DocumentTypeRef,
  Process,
  Task,
} from '../api/types'
import { customFieldDisplay, useRefsData } from '../components/CustomFields'
import { Logo } from '../components/Logo'

const RESULT_LABELS: Record<string, string> = {
  APPROVED: 'Согласовано',
  AUTO_APPROVED: 'Согласовано (авто)',
  REJECTED: 'Отклонено',
}

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'На согласовании',
  APPROVED: 'Согласован',
  REJECTED: 'Отклонён',
  CANCELLED: 'Отозван',
  FORCE_CLOSED: 'Закрыт администратором',
  PENDING_EXPORT: 'Ожидает выгрузки',
  EXPORTED: 'Выгружен',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Печатная форма документа с листом согласования. */
export function PrintDocumentPage() {
  const { documentId } = useParams()
  const refs = useRefsData(true)
  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null)
  const [process, setProcess] = useState<Process | null>(null)
  const [docTypes, setDocTypes] = useState<DocumentTypeRef[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<DocumentTypeRef[]>('/api/refs/document-types').then(setDocTypes)
    api<DocumentItem>(`/api/documents/${documentId}`)
      .then((doc) => {
        setDocumentItem(doc)
        if (doc.process) {
          api<Process>(`/api/processes/${doc.process.id}`).then(setProcess)
        }
      })
      .catch(() => setError('Документ недоступен'))
  }, [documentId])

  if (error) return <div style={{ padding: 40 }}>{error}</div>
  if (!documentItem) return null

  const docType = docTypes.find((t) => t.code === documentItem.type_code)
  const typeFields = docType?.fields ?? []

  const positionOf = (task: Task): string => {
    const slot = process?.route_snapshot?.stages
      .find((s) => s.stage_no === task.stage_no)
      ?.slots.find((sl) => sl.order_in_stage === task.order_in_stage)
    return slot?.position_name ?? '—'
  }

  const approvalTasks = (process?.tasks ?? []).filter(
    (t) => t.status === 'COMPLETED' || t.status === 'ACTIVE' || t.status === 'PENDING',
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 32, color: '#1a1a2e',
                  fontFamily: "'Segoe UI', sans-serif", fontSize: 14 }}>
      <style>{`
        @media print { .no-print { display: none } body { background: #fff } }
        table.print { width: 100%; border-collapse: collapse; margin: 8px 0 16px }
        table.print td, table.print th { border: 1px solid #999; padding: 6px 10px;
          text-align: left; vertical-align: top }
        table.print th { background: #f2f2f2; font-weight: 600 }
        table.req td { border: none; padding: 3px 0 }
        table.req td:first-child { color: #666; width: 180px }
      `}</style>

      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => window.print()} style={{ padding: '6px 16px' }}>
          Печать
        </button>
        <button onClick={() => window.close()} style={{ padding: '6px 16px' }}>
          Закрыть
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 20 }}>
        <Logo height={34} />
        <div style={{ color: '#666', fontSize: 12 }}>
          {documentItem.organization_name ?? ''}
        </div>
      </div>

      <h2 style={{ margin: '0 0 4px' }}>
        {docType?.name ?? 'Документ'} № {documentItem.number}
        {' '}от {formatDate(documentItem.date)}
      </h2>
      {process && (
        <div style={{ marginBottom: 12, color: '#444' }}>
          Статус: {STATUS_LABELS[process.status] ?? process.status}
        </div>
      )}

      <table className="req print" style={{ border: 'none' }}>
        <tbody>
          <tr><td>Организация</td><td>{documentItem.organization_name ?? '—'}</td></tr>
          <tr><td>Проект</td><td>{documentItem.project_name ?? '—'}</td></tr>
          <tr><td>Автор</td><td>{process?.initiator_name ?? documentItem.author_name ?? '—'}</td></tr>
          <tr><td>Тема</td><td>{documentItem.subject}</td></tr>
          {typeFields.map((field) => (
            <tr key={field.id}>
              <td>{field.name}</td>
              <td>{customFieldDisplay(field, documentItem.custom_fields[field.code], refs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ margin: '16px 0 4px' }}>Содержание</h3>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{documentItem.body}</div>

      {process && approvalTasks.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 4px' }}>Лист согласования</h3>
          <table className="print">
            <thead>
              <tr>
                <th style={{ width: 50 }}>Этап</th>
                <th>Должность</th>
                <th>ФИО</th>
                <th>Результат</th>
                <th>Дата</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {approvalTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.stage_no}</td>
                  <td>{positionOf(task)}</td>
                  <td>{task.assignee_name ?? '—'}</td>
                  <td>
                    {task.result
                      ? RESULT_LABELS[task.result] ?? task.result
                      : task.status === 'ACTIVE'
                        ? 'На рассмотрении'
                        : 'Ожидает'}
                  </td>
                  <td>{formatDateTime(task.completed_at)}</td>
                  <td>{task.comment ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 24, color: '#888', fontSize: 11 }}>
        Сформировано в BPM AL-BINA · {new Date().toLocaleString('ru-RU')}
      </div>
    </div>
  )
}
