import { describe, it, expect } from 'vitest'
import {
  mapDatabaseTree,
  mapPreviewResult,
  mapPipelineSummary,
  mapPipelineDetail,
} from '../services/apiMapper'

describe('mapDatabaseTree', () => {
  it('converts snake_case API response to DatabaseTree[]', () => {
    const raw = [
      {
        name: 'demo',
        schemas: [
          {
            name: 'public',
            tables: [
              {
                name: 'orders',
                columns: [
                  { name: 'id', type: 'INTEGER', nullable: false },
                  { name: 'amount', type: 'DOUBLE', nullable: true },
                ],
              },
            ],
          },
        ],
      },
    ]
    const result = mapDatabaseTree(raw)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('demo')
    expect(result[0].schemas[0].tables[0].columns[0].type).toBe('INTEGER')
    expect(result[0].schemas[0].tables[0].columns[1].type).toBe('FLOAT')
  })

  it('handles missing columns gracefully', () => {
    const raw = [{ name: 'db', schemas: [{ name: 's', tables: [{ name: 't' }] }] }]
    const result = mapDatabaseTree(raw)
    expect(result[0].schemas[0].tables[0].columns).toEqual([])
  })
})

describe('mapPreviewResult', () => {
  it('converts row_count and execution_time_ms to camelCase', () => {
    const raw = {
      columns: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'VARCHAR' }],
      rows: [[1, 'Alice'], [2, 'Bob']],
      row_count: 2,
      execution_time_ms: 12.5,
      is_sampled: false,
    }
    const result = mapPreviewResult(raw)
    expect(result.totalRows).toBe(2)
    expect(result.executionMs).toBe(12.5)
    expect(result.sampled).toBe(false)
  })

  it('converts row arrays to keyed objects', () => {
    const raw = {
      columns: [{ name: 'id', type: 'INTEGER' }, { name: 'val', type: 'VARCHAR' }],
      rows: [[42, 'hello']],
      row_count: 1,
      execution_time_ms: 5,
    }
    const result = mapPreviewResult(raw)
    expect(result.rows[0]).toEqual({ id: 42, val: 'hello' })
  })

  it('normalizes DuckDB type strings', () => {
    const raw = {
      columns: [{ name: 'ts', type: 'TIMESTAMP WITH TIME ZONE' }],
      rows: [],
      row_count: 0,
      execution_time_ms: 0,
    }
    const result = mapPreviewResult(raw)
    expect(result.columns[0].type).toBe('TIMESTAMP')
  })
})

describe('mapPipelineSummary', () => {
  it('maps node_count and timestamps to camelCase', () => {
    const raw = {
      id: 'abc-123',
      name: 'My Pipeline',
      node_count: 5,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    }
    const result = mapPipelineSummary(raw)
    expect(result.nodeCount).toBe(5)
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00Z')
    expect(result.id).toBe('abc-123')
  })
})

describe('mapPipelineDetail', () => {
  it('includes nodes and edges arrays', () => {
    const raw = {
      id: 'xyz',
      name: 'Detail Pipeline',
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    }
    const result = mapPipelineDetail(raw)
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(1)
    expect(result.name).toBe('Detail Pipeline')
  })
})
