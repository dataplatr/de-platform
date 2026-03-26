import { TopBar } from './TopBar'
import { LeftPanel } from './LeftPanel'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'

export function AppShell() {
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-[#cccccc]">
      <TopBar />

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Object Navigator (fixed ~260px) */}
        <div className="w-64 shrink-0 border-r border-[#3c3c3c] flex flex-col overflow-hidden">
          <LeftPanel />
        </div>

        {/* Center Panel: Canvas + Chat Prompt + Preview (flexible) */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <CenterPanel />
        </div>

        {/* Right Panel: Step History + SQL Viewer (fixed ~300px) */}
        <div className="w-72 shrink-0 border-l border-[#3c3c3c] flex flex-col overflow-hidden">
          <RightPanel />
        </div>
      </div>
    </div>
  )
}
