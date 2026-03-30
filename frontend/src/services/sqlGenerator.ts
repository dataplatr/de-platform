import type {
  TransformNode, TransformEdge, FilterCondition,
  JoinConfig, AggregationConfig, SelectConfig,
  TransformConfig, DeduplicateConfig, Column,
} from '../types'

/**
 * Walk upstream from nodeId and return the output column schema.
 * Join nodes merge left + right columns.
 */
export function getUpstreamColumns(
  nodeId: string,
  nodes: TransformNode[],
  edges: TransformEdge[],
): Column[] {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return []
  if (node.type === 'source') return node.columns ?? []

  const incoming = edges.filter(e => e.target === nodeId)
  if (!incoming.length) return []

  // Join merges both left (handle a) and right (handle b) columns
  if (node.type === 'join') {
    const edgeA = incoming.find(e => !e.targetHandle || e.targetHandle === 'a')
    const edgeB = incoming.find(e => e.targetHandle === 'b')
    const leftCols  = edgeA ? getUpstreamColumns(edgeA.source, nodes, edges) : []
    const rightCols = edgeB ? getUpstreamColumns(edgeB.source, nodes, edges) : []
    // Deduplicate by name (right side wins on collision)
    const seen = new Set<string>()
    const merged: Column[] = []
    ;[...leftCols, ...rightCols].forEach(c => {
      if (!seen.has(c.name)) { seen.add(c.name); merged.push(c) }
    })
    return merged
  }

  // Aggregate: output columns are the groupBy + measure aliases
  if (node.type === 'aggregate') {
    const cfg = node.config as AggregationConfig | null
    if (!cfg || (!cfg.groupBy.length && !cfg.measures.length)) {
      return getUpstreamColumns(incoming[0].source, nodes, edges)
    }
    const upstream = getUpstreamColumns(incoming[0].source, nodes, edges)
    const groupCols = cfg.groupBy
      .map(name => upstream.find(c => c.name === name))
      .filter((c): c is Column => !!c)
    const measureCols: Column[] = cfg.measures.map(m => ({
      name: m.alias || `${m.func.toLowerCase()}_${m.column}`,
      type: m.func === 'COUNT' || m.func === 'COUNT_DISTINCT' ? 'INTEGER' : 'FLOAT',
      nullable: true,
    }))
    return [...groupCols, ...measureCols]
  }

  // Select: output is only the selected columns
  if (node.type === 'select') {
    const cfg = node.config as SelectConfig | null
    if (!cfg || !cfg.columns.length) {
      return getUpstreamColumns(incoming[0].source, nodes, edges)
    }
    const upstream = getUpstreamColumns(incoming[0].source, nodes, edges)
    return cfg.columns.map(c => {
      const base = upstream.find(u => u.name === c.source)
      return { name: c.alias || c.source, type: base?.type ?? 'UNKNOWN', nullable: base?.nullable }
    })
  }

  // Transform: output is the enabled columns (with renames applied)
  if (node.type === 'transform') {
    const cfg = node.config as TransformConfig | null
    if (!cfg || !cfg.columns.length) return getUpstreamColumns(incoming[0].source, nodes, edges)
    const upstream = getUpstreamColumns(incoming[0].source, nodes, edges)
    return cfg.columns
      .filter(c => c.enabled)
      .map(c => {
        const outName = c.outputName || c.source
        const base = upstream.find(u => u.name === c.source)
        const type = c.castType || base?.type || 'UNKNOWN'
        return { name: outName, type: type as Column['type'], nullable: base?.nullable }
      })
  }

  // Deduplicate: passes through all columns unchanged
  if (node.type === 'deduplicate') {
    return getUpstreamColumns(incoming[0].source, nodes, edges)
  }

  // Filter / default: pass through upstream columns unchanged
  return getUpstreamColumns(incoming[0].source, nodes, edges)
}

/** Get columns arriving through a specific Join handle (a = left, b = right) */
export function getColumnsForHandle(
  nodeId: string,
  handleId: 'a' | 'b',
  nodes: TransformNode[],
  edges: TransformEdge[],
): Column[] {
  const incoming = edges.filter(
    e => e.target === nodeId &&
      (handleId === 'a' ? (!e.targetHandle || e.targetHandle === 'a') : e.targetHandle === 'b'),
  )
  if (!incoming.length) return []
  return getUpstreamColumns(incoming[0].source, nodes, edges)
}

/** Recursively build SQL for a node, using nested subqueries */
export function generateNodeSQL(
  nodeId: string,
  nodes: TransformNode[],
  edges: TransformEdge[],
): string {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return '-- Node not found'

  const incoming = edges.filter(e => e.target === nodeId)
  const edgeA = incoming.find(e => !e.targetHandle || e.targetHandle === 'a')
  const edgeB = incoming.find(e => e.targetHandle === 'b')

  const sql = (id?: string) => (id ? generateNodeSQL(id, nodes, edges) : null)

  switch (node.type) {
    case 'source':
      return `SELECT *\nFROM ${node.tableRef ?? 'undefined_table'}`

    case 'filter': {
      const upstream = sql(edgeA?.source)
      if (!upstream) return '-- ⚠ Connect a source node'
      const conds = (node.config as FilterCondition[]) ?? []
      if (!conds.length) return `SELECT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _f`
      const logic = conds[0]?.logic ?? 'AND'
      const where = conds.map(condSQL).join(`\n  ${logic} `)
      return `SELECT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _f\nWHERE ${where}`
    }

    case 'join': {
      const lsql = sql(edgeA?.source)
      const rsql = sql(edgeB?.source)
      if (!lsql) return '-- ⚠ Connect the LEFT source (top handle)'
      if (!rsql) return '-- ⚠ Connect the RIGHT source (bottom handle)'
      const cfg = (node.config as JoinConfig) ?? { joinType: 'INNER', conditions: [], rightTable: '' }
      const on = cfg.conditions?.length
        ? cfg.conditions.map(c => `_l.${c.leftCol} = _r.${c.rightCol}`).join('\n    AND ')
        : '/* add join conditions in Config tab */'
      return `SELECT _l.*, _r.*\nFROM (\n  ${lsql.replace(/\n/g, '\n  ')}\n) _l\n${cfg.joinType} JOIN (\n  ${rsql.replace(/\n/g, '\n  ')}\n) _r\n  ON ${on}`
    }

    case 'aggregate': {
      const upstream = sql(edgeA?.source)
      if (!upstream) return '-- ⚠ Connect a source node'
      const cfg = (node.config as AggregationConfig) ?? { groupBy: [], measures: [] }
      const selects = [
        ...cfg.groupBy,
        ...cfg.measures.map(m => {
          // Use || (not ??) so empty string falls back to auto-alias
          const alias = m.alias || `${m.func.toLowerCase()}_${m.column}`
          return `${m.func}(${m.column}) AS ${alias}`
        }),
      ]
      if (!selects.length) return `SELECT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _a`
      const gb = cfg.groupBy.length ? `\nGROUP BY ${cfg.groupBy.join(', ')}` : ''
      return `SELECT\n  ${selects.join(',\n  ')}\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _a${gb}`
    }

    case 'select': {
      const upstream = sql(edgeA?.source)
      if (!upstream) return '-- ⚠ Connect a source node'
      const cfg = (node.config as SelectConfig) ?? { columns: [] }
      if (!cfg.columns.length) return `SELECT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _s`
      const cols = cfg.columns
        .map(c => (c.alias ? `${c.source} AS ${c.alias}` : c.source))
        .join(',\n  ')
      return `SELECT\n  ${cols}\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _s`
    }

    case 'transform': {
      const upstream = sql(edgeA?.source)
      if (!upstream) return '-- ⚠ Connect a source node'
      const cfg = node.config as TransformConfig | null
      if (!cfg || !cfg.columns.length) return `SELECT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _t`
      const enabled = cfg.columns.filter(c => c.enabled)
      if (!enabled.length) return `SELECT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _t`
      const cols = enabled.map(c => {
        const outName = c.outputName || c.source || 'col'
        if (c.expression) {
          return `(${c.expression}) AS ${outName}`
        }
        const base = c.source || 'NULL'
        const casted = c.castType ? `CAST(${base} AS ${c.castType})` : base
        return outName !== c.source ? `${casted} AS ${outName}` : casted
      })
      return `SELECT\n  ${cols.join(',\n  ')}\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _t`
    }

    case 'deduplicate': {
      const upstream = sql(edgeA?.source)
      if (!upstream) return '-- ⚠ Connect a source node'
      const cfg = node.config as DeduplicateConfig | null
      if (!cfg || !cfg.partitionBy.length) {
        return `SELECT DISTINCT *\nFROM (\n  ${upstream.replace(/\n/g, '\n  ')}\n) _d`
      }
      const partBy = cfg.partitionBy.join(', ')
      const orderBy = cfg.orderBy
        ? `ORDER BY ${cfg.orderBy} ${cfg.orderDir}`
        : 'ORDER BY (SELECT NULL)'
      return `SELECT *\nFROM (\n  SELECT *, ROW_NUMBER() OVER (PARTITION BY ${partBy} ${orderBy}) AS _rn\n  FROM (\n    ${upstream.replace(/\n/g, '\n    ')}\n  ) _d\n) _dedup\nWHERE _rn = 1`
    }

    default:
      return '-- Unknown node type'
  }
}

function condSQL(c: FilterCondition): string {
  if (c.operator === 'IS NULL')     return `${c.column} IS NULL`
  if (c.operator === 'IS NOT NULL') return `${c.column} IS NOT NULL`
  if (c.operator === 'BETWEEN') {
    const [lo, hi] = (c.value?.toString() ?? '').split(',').map(v => v.trim())
    return `${c.column} BETWEEN '${lo ?? ''}' AND '${hi ?? ''}'`
  }
  if (c.operator === 'IN' || c.operator === 'NOT IN') {
    const vals = (c.value?.toString() ?? '').split(',').map(v => `'${v.trim()}'`).join(', ')
    return `${c.column} ${c.operator} (${vals})`
  }
  // Numeric operators — don't quote if value looks numeric
  if (['>', '<', '>=', '<='].includes(c.operator)) {
    const v = c.value?.toString() ?? ''
    const isNum = /^-?\d+(\.\d+)?$/.test(v)
    return `${c.column} ${c.operator} ${isNum ? v : `'${v}'`}`
  }
  return `${c.column} ${c.operator} '${c.value ?? ''}'`
}
