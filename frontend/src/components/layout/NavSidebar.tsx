/**
 * NavSidebar — Databricks / Arc-style vertical sliding navigation rail.
 *
 * Collapsed (default): 48 px wide, icon-only.
 * Expanded (hover):    220 px wide, icons + labels + section headers.
 * Transitions use CSS width animation for a smooth slide-out effect.
 */
import { useState } from 'react'
import {
  Home,
  Database,
  Compass,
  Code2,
  GitBranch,
  PlayCircle,
  Zap,
  Settings,
  Activity,
  Clock,
  MessageSquare,
  BarChart3,
  Gauge,
  Shield,
  BookOpen,
  FileText,
  Bell,
  Headphones,
  Plug,
  LogOut,
  ShieldCheck,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { useAuthStore, isAdmin } from '../../store/authStore'
import { useTheme } from '../../context/ThemeContext'
import { ROLE_COLOR } from '../../constants/nodeMetadata'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  activeId?: string
  onSelect?: () => void
  dummy?: boolean
}

interface NavSection {
  sectionLabel?: string
  items: NavItem[]
}

// ── Navigation data ────────────────────────────────────────────────────────────

const SECTIONS: NavSection[] = [
  {
    items: [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'workspace', label: 'Workspace', icon: Database },
      { id: 'explore', label: 'Explore', icon: Compass, dummy: true },
    ],
  },
  {
    sectionLabel: 'MODEL',
    items: [
      { id: 'ide', label: 'IDE', icon: Code2, dummy: true },
      { id: 'visual-model', label: 'Visual Model', icon: GitBranch, dummy: true },
      { id: 'playground', label: 'Playground', icon: PlayCircle, dummy: true },
      { id: 'sql-runner', label: 'SQL Runner', icon: Zap, dummy: true },
      { id: 'api', label: 'API & Integrations', icon: Plug, dummy: true },
      { id: 'settings', label: 'Settings', icon: Settings, dummy: true },
    ],
  },
  {
    sectionLabel: 'MONITORING',
    items: [
      { id: 'status', label: 'Status', icon: Activity, dummy: true },
      { id: 'query-history', label: 'Query History', icon: Clock, dummy: true },
      { id: 'chat-history', label: 'Chat History', icon: MessageSquare, dummy: true },
      { id: 'pre-agg', label: 'Pre-Aggregations', icon: BarChart3, dummy: true },
      { id: 'performance', label: 'Performance', icon: Gauge, dummy: true },
    ],
  },
]

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'admin', label: 'Admin', icon: Shield, dummy: true },
  { id: 'docs', label: 'Documentation', icon: BookOpen, dummy: true },
  { id: 'changelog', label: 'Changelog', icon: FileText, dummy: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, dummy: true },
  { id: 'support', label: 'Support', icon: Headphones, dummy: true },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function NavSidebar() {
  const [expanded, setExpanded] = useState(false)
  const { closeEditor, editorOpen } = useTransformationStore()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()

  // Active nav item depends on whether the pipeline editor is open
  const activeId = editorOpen ? 'workspace' : 'home'

  // "Workspace" is only reachable by opening a pipeline — it's disabled on the home screen
  function isItemDisabled(item: NavItem): boolean {
    if (item.dummy) return true
    if (item.id === 'workspace' && !editorOpen) return true
    return false
  }

  function handleItemClick(item: NavItem) {
    if (isItemDisabled(item)) return
    if (item.id === 'home') closeEditor()
    // workspace = already there; others are disabled
  }

  return (
    <div
      className={clsx(
        'nav-sidebar shrink-0 flex flex-col h-full border-r border-theme bg-surface overflow-hidden z-30',
        'transition-[width] duration-200 ease-in-out',
        expanded ? 'w-[220px]' : 'w-12'
      )}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* ── Workspace header ── */}
      <div className="flex items-center gap-2.5 px-3 h-12 border-b border-theme shrink-0 overflow-hidden">
        {/* Logo mark */}
        <div className="w-6 h-6 rounded-[4px] bg-[var(--accent)] flex items-center justify-center shrink-0">
          <span className="text-white text-[9px] font-bold leading-none select-none">D</span>
        </div>
        {/* Workspace label — fades in when expanded */}
        <div
          className={clsx(
            'flex flex-col min-w-0 transition-[opacity,transform] duration-150',
            expanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1 pointer-events-none'
          )}
        >
          <span className="text-[11px] font-semibold text-primary truncate leading-tight">
            dataplatr
          </span>
          <span className="text-[9px] text-muted truncate">Main</span>
        </div>
      </div>

      {/* ── Scrollable nav sections ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 scrollbar-thin">

        {/* ── Theme toggle — always at the top ── */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className={clsx(
            'w-full flex items-center py-1.5 text-secondary hover:bg-elevated hover:text-primary transition-colors duration-100 overflow-hidden whitespace-nowrap border-b border-theme mb-1',
            expanded ? 'justify-start gap-2.5 px-3' : 'justify-center px-0'
          )}
        >
          {theme === 'dark' ? <Sun size={14} className="shrink-0" /> : <Moon size={14} className="shrink-0" />}
          <span
            className={clsx(
              'text-[11px] transition-[opacity,max-width] duration-150 truncate',
              expanded ? 'opacity-100 max-w-[160px]' : 'opacity-0 max-w-0 overflow-hidden'
            )}
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>

        {SECTIONS.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-1' : ''}>
            {/* Section label — hidden when collapsed */}
            {section.sectionLabel && (
              <div
                className={clsx(
                  'px-3 text-[9px] font-bold uppercase tracking-widest text-muted',
                  'transition-[opacity,height,padding] duration-150 overflow-hidden',
                  expanded ? 'opacity-100 py-1 h-auto' : 'opacity-0 h-0 py-0'
                )}
              >
                {section.sectionLabel}
              </div>
            )}

            {section.items.map((item) => {
              const Icon = item.icon
              const isActive = item.id === activeId
              const disabled = isItemDisabled(item)
              // Special tooltip for Workspace when no pipeline is open
              const tooltip = !expanded
                ? (item.id === 'workspace' && !editorOpen
                    ? 'Open a pipeline to enter the editor'
                    : item.label)
                : undefined

              return (
                <button
                  key={item.id}
                  type="button"
                  title={tooltip}
                  onClick={() => handleItemClick(item)}
                  disabled={disabled}
                  className={clsx(
                    'w-full flex items-center py-1.5 overflow-hidden whitespace-nowrap transition-colors duration-100',
                    expanded ? 'justify-start gap-2.5 px-3' : 'justify-center px-0',
                    isActive
                      ? 'bg-[var(--selected-bg)] text-[var(--accent-fg)]'
                      : !disabled
                        ? 'text-secondary hover:bg-elevated hover:text-primary cursor-pointer'
                        : 'text-muted opacity-40 cursor-default'
                  )}
                >
                  <Icon size={14} className="shrink-0" />
                  <div className="flex flex-col min-w-0 overflow-hidden">
                    <span
                      className={clsx(
                        'text-[11px] transition-[opacity,max-width] duration-150 truncate',
                        expanded ? 'opacity-100 max-w-[140px]' : 'opacity-0 max-w-0 overflow-hidden'
                      )}
                    >
                      {item.label}
                    </span>
                    {/* Hint shown below Workspace label when disabled and expanded */}
                    {item.id === 'workspace' && !editorOpen && expanded && (
                      <span className="text-[9px] text-muted truncate max-w-[140px]">
                        Open a pipeline first
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))}

        {/* ── Favourite Workbooks (expanded only) ── */}
        <div
          className={clsx(
            'mt-2 transition-[opacity,height] duration-150 overflow-hidden',
            expanded ? 'opacity-100' : 'opacity-0 h-0'
          )}
        >
          <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-muted">
            Favourite Workbooks
          </div>
          <div className="px-3 py-1 text-[10px] text-muted italic">No favourite workbooks</div>
        </div>

        {/* ── Recent Chats (expanded only) ── */}
        <div
          className={clsx(
            'mt-1 transition-[opacity,height] duration-150 overflow-hidden',
            expanded ? 'opacity-100' : 'opacity-0 h-0'
          )}
        >
          <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-muted">
            Recent Chats
          </div>
          <div className="px-3 py-1 text-[10px] text-muted italic truncate">No recent chats</div>
        </div>
      </div>

      {/* ── Bottom actions ── */}
      <div className="border-t border-theme py-1 shrink-0 overflow-hidden">
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              title={expanded ? undefined : item.label}
              disabled
              className={clsx(
                'w-full flex items-center py-1.5 text-muted opacity-50 cursor-default overflow-hidden whitespace-nowrap',
                expanded ? 'justify-start gap-2.5 px-3' : 'justify-center px-0'
              )}
            >
              <Icon size={14} className="shrink-0" />
              <span
                className={clsx(
                  'text-[11px] transition-[opacity,max-width] duration-150 truncate',
                  expanded ? 'opacity-100 max-w-[160px]' : 'opacity-0 max-w-0 overflow-hidden'
                )}
              >
                {item.label}
              </span>
            </button>
          )
        })}

        {/* User row — avatar always visible; details + logout on expand */}
        {user && (
          <div className={clsx(
            'flex items-center py-2 overflow-hidden whitespace-nowrap',
            expanded ? 'gap-2 px-3' : 'justify-center px-0'
          )}>
            {/* Avatar */}
            <div className="w-[20px] h-[20px] rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
              {isAdmin(user.role) ? (
                <ShieldCheck size={11} className="text-white" />
              ) : (
                <span className="text-[8px] text-white font-bold leading-none select-none">
                  {user.username?.[0]?.toUpperCase() ?? 'U'}
                </span>
              )}
            </div>
            {/* Name + role — shown when expanded */}
            <div
              className={clsx(
                'flex flex-col min-w-0 flex-1 transition-[opacity,max-width] duration-150 overflow-hidden',
                expanded ? 'opacity-100 max-w-[110px]' : 'opacity-0 max-w-0'
              )}
            >
              <span className="text-[10px] text-primary font-medium truncate leading-tight">
                {user.username}
              </span>
              <span className={clsx('text-[8px] font-bold uppercase truncate', ROLE_COLOR[user.role])}>
                {user.role}
              </span>
            </div>
            {/* Logout button — shown when expanded */}
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className={clsx(
                'p-1 rounded text-muted hover:text-error hover:bg-[var(--node-filter-bg)] transition-all shrink-0',
                expanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 max-w-0 pointer-events-none overflow-hidden'
              )}
            >
              <LogOut size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
