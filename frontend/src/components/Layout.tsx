import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Drawer from '@mui/material/Drawer'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import Badge from '@mui/material/Badge'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import TranslateIcon from '@mui/icons-material/Translate'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { DocumentTypeRef } from '../api/types'
import { useAuth } from '../auth'
import { LANGUAGES } from '../i18n'
import { usePreferences } from '../preferences'
import { GlobalSearch } from './GlobalSearch'
import { Logo } from './Logo'
import { NotificationsBell } from './NotificationsBell'
import { TelegramLinkDialog } from './TelegramLinkDialog'

export interface Counters {
  active_tasks: number
  overdue_tasks: number
  unread_notifications: number
}

const WIDTH_OPEN = 278
const WIDTH_COLLAPSED = 68

const NAV_TEXT = 'text.primary'
const NAV_LEAF_TEXT = 'text.secondary'

interface Leaf {
  to: string
  label: string
  /** дополнительные пути, при которых пункт подсвечивается */
  also?: string[]
}

interface Group {
  key: string
  label: string
  icon: React.ReactNode
  children: Leaf[]
}

// [путь, ключ перевода] справочников
const DIRECTORY_LEAVES: [string, string][] = [
  ['/admin/organizations', 'nav.organizations'],
  ['/admin/departments', 'nav.departments'],
  ['/admin/positions', 'nav.positions'],
  ['/admin/employees', 'nav.employees'],
  ['/admin/employments', 'nav.employments'],
  ['/admin/projects', 'nav.projects'],
  ['/admin/project-assignments', 'nav.projectAssignments'],
  ['/admin/absences', 'nav.absences'],
  ['/admin/substitutions', 'nav.substitutions'],
]

function leafSelected(leaf: Leaf, path: string): boolean {
  return [leaf.to, ...(leaf.also ?? [])].some((p) => path.startsWith(p))
}

const itemSx = {
  borderRadius: 1.5,
  mx: 1,
  color: NAV_TEXT,
  '&.Mui-selected': {
    bgcolor: 'primary.light',
    color: 'primary.dark',
    '&:hover': { bgcolor: 'primary.light' },
  },
}

export function Layout() {
  const { user, loading, logout } = useAuth()
  const { t } = useTranslation()
  const { mode, locale, setMode, setLocale } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
  const [langAnchor, setLangAnchor] = useState<HTMLElement | null>(null)

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('bpm_nav_collapsed') === '1',
  )
  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      localStorage.setItem('bpm_nav_collapsed', prev ? '0' : '1')
      return !prev
    })

  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const isMatrixEditor = isAdmin || (user?.roles.includes('MATRIX_EDITOR') ?? false)

  // виды документов — динамические, из конструктора
  const [docTypes, setDocTypes] = useState<DocumentTypeRef[]>([])
  useEffect(() => {
    if (user) api<DocumentTypeRef[]>('/api/refs/document-types').then(setDocTypes)
  }, [user])

  // счётчики для колокольчика и бейджа задач (обновление раз в 30 сек)
  const [counters, setCounters] = useState<Counters>({
    active_tasks: 0, overdue_tasks: 0, unread_notifications: 0,
  })
  useEffect(() => {
    if (!user) return
    const load = () => api<Counters>('/api/my/counters').then(setCounters).catch(() => {})
    load()
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [user, location.pathname])
  const refreshCounters = () =>
    api<Counters>('/api/my/counters').then(setCounters).catch(() => {})

  const groups = useMemo(() => {
    const result: Group[] = [
      {
        key: 'documents',
        label: t('nav.documents'),
        icon: <DescriptionOutlinedIcon fontSize="small" />,
        children: docTypes.length
          ? docTypes.map((dt) => ({
              to: `/documents/${dt.code}`,
              label: dt.name,  // название вида — пользовательские данные
            }))
          : [{ to: '/documents/MEMO', label: t('nav.documents') }],
      },
    ]
    if (isAdmin) {
      result.push({
        key: 'directories',
        label: t('nav.references'),
        icon: <FolderOutlinedIcon fontSize="small" />,
        children: [
          ...DIRECTORY_LEAVES.map(([to, key]) => ({ to, label: t(key) })),
          { to: '/admin/dictionaries', label: t('nav.dictionaries') },
        ],
      })
    }
    if (isAdmin || isMatrixEditor) {
      const children: Leaf[] = []
      if (isAdmin) children.push({ to: '/admin/document-types', label: t('nav.documentTypes') })
      if (isAdmin) children.push({ to: '/admin/users', label: t('nav.users') })
      if (isAdmin) children.push({ to: '/admin/exchange', label: t('nav.exchange') })
      children.push({ to: '/admin/route-rules', label: t('nav.routeMatrix') })
      if (isAdmin) children.push({ to: '/admin/analytics', label: t('nav.analytics') })
      if (isAdmin) children.push({ to: '/admin/overdue', label: t('nav.overdue') })
      if (isAdmin) children.push({ to: '/admin/audit', label: t('nav.audit') })
      if (isAdmin) children.push({ to: '/admin/errors', label: t('nav.errors') })
      if (isAdmin) children.push({ to: '/admin/settings', label: t('nav.settings') })
      result.push({
        key: 'administration',
        label: t('nav.administration'),
        icon: <AdminPanelSettingsOutlinedIcon fontSize="small" />,
        children,
      })
    }
    return result
  }, [isAdmin, isMatrixEditor, docTypes, t])

  const [open, setOpen] = useState<Record<string, boolean>>({ documents: true })

  // на странице процесса подсвечиваем вид документа, к которому он относится
  const [activeObjectType, setActiveObjectType] = useState<string | null>(null)
  useEffect(() => {
    const match = location.pathname.match(/^\/process\/([^/]+)/)
    if (!match) {
      setActiveObjectType(null)
      return
    }
    let cancelled = false
    api<{ object_type: string }>(`/api/processes/${match[1]}`)
      .then((p) => { if (!cancelled) setActiveObjectType(p.object_type) })
      .catch(() => { if (!cancelled) setActiveObjectType(null) })
    return () => { cancelled = true }
  }, [location.pathname])

  const isLeafSelected = (leaf: Leaf) =>
    leafSelected(leaf, location.pathname) ||
    (activeObjectType !== null && leaf.to === `/documents/${activeObjectType}`)

  // выпадающее меню раздела при наведении в свёрнутом состоянии
  const [hoverMenu, setHoverMenu] = useState<{
    key: string
    anchor: HTMLElement
  } | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const cancelClose = () => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    hoverTimer.current = window.setTimeout(() => setHoverMenu(null), 200)
  }

  useEffect(() => {
    const active = groups.find((g) =>
      g.children.some((leaf) => isLeafSelected(leaf)),
    )
    if (active) setOpen((prev) => ({ ...prev, [active.key]: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, location.pathname, activeObjectType])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  const width = collapsed ? WIDTH_COLLAPSED : WIDTH_OPEN

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          width,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width,
            overflowX: 'hidden',
            transition: 'width 0.2s',
            // в светлой теме — белый лист, как карточки (фон страницы газетный)
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? '#2a251d' : '#ffffff',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        {collapsed ? (
          <Stack sx={{ alignItems: 'center', pt: 2, pb: 1 }} spacing={0.5}>
            <Logo mark height={30} />
            <Tooltip title="Развернуть меню">
              <IconButton
                size="small"
                onClick={toggleCollapsed}
                sx={{ color: 'text.secondary', p: 0.4 }}
              >
                <MenuIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : (
          <Stack
            direction="row"
            sx={{
              px: 2.5,
              py: 2,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Logo height={32} />
            <Tooltip title="Свернуть меню">
              <IconButton
                size="small"
                onClick={toggleCollapsed}
                sx={{ color: 'text.secondary', p: 0.4 }}
              >
                <ChevronLeftIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        )}

        <List sx={{ flexGrow: 1, pt: 0 }}>
          <Tooltip title={collapsed ? t('nav.home') : ''} placement="right">
            <ListItemButton
              component={NavLink}
              to="/"
              selected={location.pathname === '/'}
              sx={{ ...itemSx, justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: 'inherit' }}>
                <HomeOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={t('nav.home')}
                  slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                />
              )}
            </ListItemButton>
          </Tooltip>
          <Tooltip title={collapsed ? t('nav.tasks') : ''} placement="right">
            <ListItemButton
              component={NavLink}
              to="/tasks"
              selected={location.pathname.startsWith('/tasks')}
              sx={{ ...itemSx, justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <ListItemIcon
                sx={{ minWidth: collapsed ? 0 : 34, color: 'inherit' }}
              >
                <Badge
                  badgeContent={counters.active_tasks}
                  color={counters.overdue_tasks > 0 ? 'error' : 'primary'}
                  max={99}
                >
                  <TaskAltIcon fontSize="small" />
                </Badge>
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={t('nav.tasks')}
                  slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                />
              )}
            </ListItemButton>
          </Tooltip>

          {groups.map((group) => (
            <Box key={group.key}>
                <ListItemButton
                  onMouseEnter={(e) => {
                    if (collapsed) {
                      cancelClose()
                      setHoverMenu({ key: group.key, anchor: e.currentTarget })
                    }
                  }}
                  onMouseLeave={() => {
                    if (collapsed) scheduleClose()
                  }}
                  onClick={() => {
                    if (collapsed) {
                      // из свёрнутого меню: развернуть, раскрыть раздел
                      // и открыть его первый пункт
                      setHoverMenu(null)
                      toggleCollapsed()
                      setOpen((prev) => ({ ...prev, [group.key]: true }))
                      navigate(group.children[0].to)
                    } else {
                      setOpen((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                    }
                  }}
                  sx={{
                    borderRadius: 1.5, mx: 1, color: NAV_TEXT,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: 'inherit' }}>
                    {group.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <>
                      <ListItemText
                        primary={group.label}
                        slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                      />
                      {open[group.key] ? (
                        <ExpandLessIcon fontSize="small" />
                      ) : (
                        <ExpandMoreIcon fontSize="small" />
                      )}
                    </>
                  )}
                </ListItemButton>
              {!collapsed && (
                <Collapse in={Boolean(open[group.key])} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {group.children.map((leaf) => (
                      <ListItemButton
                        key={leaf.to}
                        component={NavLink}
                        to={leaf.to}
                        selected={isLeafSelected(leaf)}
                        sx={{ ...itemSx, pl: 5.5, py: 0.6, color: NAV_LEAF_TEXT }}
                      >
                        <ListItemText
                          primary={leaf.label}
                          slotProps={{
                            primary: { sx: { fontSize: 13.5, fontWeight: 500 } },
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              )}
            </Box>
          ))}
        </List>

        {hoverMenu !== null &&
          (() => {
            const group = groups.find((g) => g.key === hoverMenu.key)
            if (!group) return null
            return (
              <Popper
                open
                anchorEl={hoverMenu.anchor}
                placement="right-start"
                sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
              >
                <Paper
                  elevation={4}
                  variant="elevation"
                  onMouseEnter={cancelClose}
                  onMouseLeave={() => setHoverMenu(null)}
                  sx={{ ml: 0.5, py: 0.5, minWidth: 230 }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ px: 2, py: 0.5, color: 'text.secondary' }}
                  >
                    {group.label}
                  </Typography>
                  <List dense disablePadding>
                    {group.children.map((leaf) => (
                      <ListItemButton
                        key={leaf.to}
                        component={NavLink}
                        to={leaf.to}
                        selected={isLeafSelected(leaf)}
                        onClick={() => setHoverMenu(null)}
                        sx={{
                          color: NAV_LEAF_TEXT,
                          '&.Mui-selected': {
                            bgcolor: 'primary.light',
                            color: 'primary.dark',
                          },
                        }}
                      >
                        <ListItemText
                          primary={leaf.label}
                          slotProps={{
                            primary: { sx: { fontSize: 13.5, fontWeight: 500 } },
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              </Popper>
            )
          })()}

        <Box
          sx={{
            p: collapsed ? 1 : 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 1,
          }}
        >
          {!collapsed && (
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: NAV_TEXT }}>
                {user.display_name ?? user.ad_sam_account_name}
              </Typography>
            </Box>
          )}
          {!collapsed && (
            <Tooltip title={t('prefs.theme')}>
              <IconButton
                size="small"
                onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
                sx={{ color: NAV_TEXT }}
              >
                {mode === 'dark' ? (
                  <LightModeOutlinedIcon fontSize="small" />
                ) : (
                  <DarkModeOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          )}
          {!collapsed && (
            <Tooltip title={t('prefs.language')}>
              <IconButton
                size="small"
                onClick={(e) => setLangAnchor(e.currentTarget)}
                sx={{ color: NAV_TEXT }}
              >
                <TranslateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Menu
            anchorEl={langAnchor}
            open={langAnchor !== null}
            onClose={() => setLangAnchor(null)}
          >
            {LANGUAGES.map((lang) => (
              <MenuItem
                key={lang.code}
                selected={locale === lang.code}
                onClick={() => { setLocale(lang.code); setLangAnchor(null) }}
              >
                {lang.label}
              </MenuItem>
            ))}
          </Menu>
          {!collapsed && <TelegramLinkDialog />}
          <Tooltip title={t('common.logout')}>
            <IconButton size="small" onClick={logout} sx={{ color: NAV_TEXT }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* верхняя панель: поиск по документам и уведомления */}
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ px: 3, pt: 2, alignItems: 'center', justifyContent: 'flex-end' }}
        >
          <GlobalSearch />
          <NotificationsBell
            unread={counters.unread_notifications}
            onChanged={refreshCounters}
          />
        </Stack>
        <Box component="main" sx={{ flexGrow: 1, p: 3, pt: 2, minWidth: 0 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
