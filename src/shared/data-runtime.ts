// Kind-specific node data: memory, sessions, plans, state.

export interface MemoryIndexData {
  projectPath?: string
  entries: number
}

export interface MemoryFileData {
  name?: string
  description?: string
  type?: string
}

export interface SessionData {
  sessionId: string
  cwd?: string
  gitBranch?: string
  version?: string
  firstTimestamp?: string
  subagentCount: number
  hasToolResults: boolean
}

export interface LiveSessionData {
  pid: number
  sessionId?: string
  cwd?: string
  startedAt?: number
  version?: string
  name?: string
  status?: string
  kind?: string
  entrypoint?: string
  alive: boolean
}

export interface LogFileData {
  purpose: string
  byProject?: Record<string, number>
  firstTs?: string
  lastTs?: string
}

export interface PlanData {
  title: string
  slug: string
}

export interface StateDirData {
  purpose: string
  fileCount: number
  totalBytes: number
  shallow: boolean
}

export interface CredentialsData {
  exists: boolean
}

export interface BrokenFileData {
  error: string
  line?: number
  column?: number
  parsedWithJsonc: boolean
  /** The kind this file would have been had it parsed (settings, mcpServer, ...). */
  intendedKind: string
}
