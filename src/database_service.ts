import { Pool, PoolClient } from 'pg';

export interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
}

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      ssl: true,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async getSchema(): Promise<TableInfo[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `;
      
      const result = await client.query(query);
      const columns = result.rows as ColumnInfo[];
      
      // Group columns by table
      const tableMap = new Map<string, ColumnInfo[]>();
      
      columns.forEach(col => {
        if (!tableMap.has(col.table_name)) {
          tableMap.set(col.table_name, []);
        }
        tableMap.get(col.table_name)!.push(col);
      });
      
      return Array.from(tableMap.entries()).map(([table_name, columns]) => ({
        table_name,
        columns
      }));
    } finally {
      client.release();
    }
  }

  async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}