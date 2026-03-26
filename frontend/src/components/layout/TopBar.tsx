import { Play, Save, Settings, Database, ChevronRight, LogOut, User, ShieldCheck } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { useAuthStore, isAdmin } from '../../store/authStore'
import clsx from 'clsx'
import logoWhite from '../../assets/logo-white.png'

const ROLE_COLOR: Record<string, string> = {
  admin:   'text-[#f44747]',
  analyst: 'text-accent-light',
  viewer:  'text-text-dim',
}

export function TopBar() {
  const { isConnected, nodes } = useTransformationStore()
  const { user, logout } = useAuthStore()
  const hasNodes = nodes.length > 0

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-[#1e1e1e] border-b border-[#3c3c3c] shrink-0 z-10">

      {/* Left: Logo + Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#969696]">
        <img src={logoWhite} alt="Logo" className="h-5 w-auto object-contain shrink-0" />
        <div className="w-px h-4 bg-border-default mx-1" />
        <Database size={14} className="text-accent-light" />
        <span className="text-[#cccccc] font-medium">dataplatr</span>
        <ChevronRight size={12} />
        <span>Visual Transformation Builder</span>
        <ChevronRight size={12} />
        <span className="text-[#4fc1ff]">Untitled Pipeline</span>
      </div>

      {/* Center: Connection status */}
      <div className="flex items-center gap-2">
        <div className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
          isConnected ? 'bg-[#1e3a2b] text-[#4ec9b0]' : 'bg-[#3a2b1e] text-[#dcdcaa]'
        )}>
          <div className={clsx(
            'w-1.5 h-1.5 rounded-full',
            isConnected ? 'bg-[#4ec9b0]' : 'bg-[#dcdcaa]'
          )} />
          {isConnected ? 'DuckDB Connected' : 'No Connection'}
        </div>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded hover:bg-[#3c3c3c] text-[#cccccc] transition-colors"
          title="Save pipeline"
        >
          <Save size={13} />
          <span>Save</span>
        </button>
        <button
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
            hasNodes
              ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white'
              : 'bg-[#2d2d30] text-[#6a6a6a] cursor-not-allowed'
          )}
          disabled={!hasNodes}
          title="Run pipeline"
        >
          <Play size={13} />
          <span>Run</span>
        </button>
        <button className="icon-button ml-1" title="Settings">
          <Settings size={14} />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-border-default mx-1" />

        {/* User pill */}
        {user && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[#cccccc]">
            {isAdmin(user.role)
              ? <ShieldCheck size={13} className="text-[#f44747]" />
              : <User size={13} className="text-text-dim" />
            }
            <span className="font-medium">{user.username}</span>
            <span className={clsx('text-[10px] uppercase font-semibold', ROLE_COLOR[user.role] ?? 'text-text-dim')}>
              {user.role}
            </span>
          </div>
        )}

        <button
          onClick={logout}
          className="icon-button"
          title="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  )
}
