import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Logo } from './Logo'

const WIDTH_OPEN = 250
const WIDTH_COLLAPSED = 68

// цвета текста меню: заметно темнее, чем text.secondary
const NAV_TEXT = '#3d4658'
const NAV_LEAF_TEXT = '#4b5568'

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

const DIRECTORY_LEAVES: Leaf[] = [
  { to: '/admin/organizations', label: 'Организации' },
  { to: '/admin/departments', label: 'Подразделения' },
  { to: '/admin/positions', label: 'Должности' },
  { to: '/admin/employees', label: 'Сотрудники' },
  { to: '/admin/employments', label: 'Трудоустройства' },
  { to: '/admin/projects', label: 'Проекты' },
  { to: '/admin/project-assignments', label: 'Назначения на проекты' },
  { to: '/admin/absences', label: 'Отсутствия' },
  { to: '/admin/substitutions', label: 'Замещения' },
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
  const location = useLocation()
  const navigate = useNavigate()

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

  const groups = useMemo(() => {
    const result: Group[] = [
      {
        key: 'documents',
        label: 'Документы',
        icon: <DescriptionOutlinedIcon fontSize="small" />,
        children: [
          { to: '/memos', label: 'Служебные записки', also: ['/process'] },
          // сюда добавятся заявки на договор и на оплату
        ],
      },
    ]
    if (isAdmin) {
      result.push({
        key: 'directories',
        label: 'Справочники',
        icon: <FolderOutlinedIcon fontSize="small" />,
        children: DIRECTORY_LEAVES,
      })
    }
    if (isAdmin || isMatrixEditor) {
      const children: Leaf[] = []
      if (isAdmin) children.push({ to: '/admin/users', label: 'Пользователи' })
      children.push({ to: '/admin/route-rules', label: 'Матрица согласования' })
      if (isAdmin) children.push({ to: '/admin/settings', label: 'Настройки BPM' })
      result.push({
        key: 'administration',
        label: 'Администрирование',
        icon: <AdminPanelSettingsOutlinedIcon fontSize="small" />,
        children,
      })
    }
    return result
  }, [isAdmin, isMatrixEditor])

  const [open, setOpen] = useState<Record<string, boolean>>({ documents: true })

  useEffect(() => {
    const active = groups.find((g) =>
      g.children.some((leaf) => leafSelected(leaf, location.pathname)),
    )
    if (active) setOpen((prev) => ({ ...prev, [active.key]: true }))
  }, [groups, location.pathname])

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
            bgcolor: '#fbfcfe',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Stack
          direction="row"
          sx={{
            px: collapsed ? 1 : 2.5,
            py: 2,
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
        >
          {!collapsed && <Logo height={32} />}
          <Tooltip title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}>
            <IconButton size="small" onClick={toggleCollapsed} sx={{ color: NAV_TEXT }}>
              {collapsed ? <MenuIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>

        <List sx={{ flexGrow: 1, pt: 0 }}>
          <Tooltip title={collapsed ? 'Мои задачи' : ''} placement="right">
            <ListItemButton
              component={NavLink}
              to="/tasks"
              selected={location.pathname.startsWith('/tasks')}
              sx={{ ...itemSx, justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <ListItemIcon
                sx={{ minWidth: collapsed ? 0 : 34, color: 'inherit' }}
              >
                <TaskAltIcon fontSize="small" />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary="Мои задачи"
                  slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                />
              )}
            </ListItemButton>
          </Tooltip>

          {groups.map((group) => (
            <Box key={group.key}>
              <Tooltip title={collapsed ? group.label : ''} placement="right">
                <ListItemButton
                  onClick={() => {
                    if (collapsed) {
                      // из свёрнутого меню: развернуть, раскрыть раздел
                      // и открыть его первый пункт
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
              </Tooltip>
              {!collapsed && (
                <Collapse in={Boolean(open[group.key])} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {group.children.map((leaf) => (
                      <ListItemButton
                        key={leaf.to}
                        component={NavLink}
                        to={leaf.to}
                        selected={leafSelected(leaf, location.pathname)}
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
              {user.employee_id === null && (
                <Typography variant="caption" color="text.secondary">
                  Не сопоставлен с сотрудником
                </Typography>
              )}
            </Box>
          )}
          <Tooltip title="Выйти">
            <IconButton size="small" onClick={logout} sx={{ color: NAV_TEXT }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, maxWidth: 1250 }}>
        <Outlet />
      </Box>
    </Box>
  )
}
