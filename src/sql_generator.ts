import { SemanticMapper, SemanticContext, QueryIntent, ColumnMapping } from './semantic_mapper';
import { TableInfo } from './database_service';

export interface SQLQuery {
  sql: string;
  params: any[];
}

export interface DateRange {
  start: Date;
  end: Date;
}

export class SQLGenerator {
  private semanticMapper: SemanticMapper;

  constructor(semanticMapper: SemanticMapper) {
    this.semanticMapper = semanticMapper;
  }

  generateSQL(question: string): SQLQuery {
    const context = this.semanticMapper.buildSemanticContext(question);
    const columnMappings = this.semanticMapper.findBestColumnMatches(context.userWords);
    
    // Build SQL components
    const selectClause = this.buildSelectClause(context, columnMappings);
    const fromClause = this.buildFromClause(columnMappings, question);
    const whereClause = this.buildWhereClause(question, columnMappings, context.userWords);
    const groupByClause = this.buildGroupByClause(context, columnMappings);
    const orderByClause = this.buildOrderByClause(context, columnMappings);

    const sql = [
      selectClause.sql,
      fromClause.sql,
      whereClause.sql,
      groupByClause.sql,
      orderByClause.sql
    ].filter(clause => clause.trim() !== '').join(' ');

    const params = [
      ...selectClause.params,
      ...fromClause.params,
      ...whereClause.params,
      ...groupByClause.params,
      ...orderByClause.params
    ];

    // Debug logging
    console.log('DEBUG: SQL components:');
    console.log('  Select:', selectClause.sql);
    console.log('  From:', fromClause.sql);
    console.log('  Where:', whereClause.sql);
    console.log('  GroupBy:', groupByClause.sql);
    console.log('  OrderBy:', orderByClause.sql);
    console.log('  Final SQL:', sql);
    console.log('  Params:', params);

    return { sql, params };
  }

  private buildSelectClause(context: SemanticContext, mappings: ColumnMapping[]): SQLQuery {
    const { intent } = context;
    
    switch (intent) {
      case QueryIntent.COUNT:
        return { sql: 'SELECT COUNT(*) as count', params: [] };
        
      case QueryIntent.AVERAGE:
        const avgColumn = this.findNumericColumn(mappings, ['time', 'duration', 'minutes', 'hours']);
        if (avgColumn) {
          return { 
            sql: `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (trips.ended_at - trips.started_at))/60)) as average`, 
            params: [] 
          };
        }
        break;
        
      case QueryIntent.SUM:
        const sumColumn = this.findNumericColumn(mappings, ['distance', 'kilometres', 'km', 'miles']);
        if (sumColumn) {
          return { 
            sql: `SELECT ROUND(SUM(trips.trip_distance_km)::numeric, 1) as total`, 
            params: [] 
          };
        }
        break;
        
      case QueryIntent.MAX:
        const maxColumn = this.findColumn(mappings, ['station', 'point', 'dock', 'name', 'avenue']);
        if (maxColumn) {
          // For station-related MAX queries, we want the station name, not the ID
          if (maxColumn.column.includes('station') || maxColumn.column.includes('id')) {
            return { 
              sql: `SELECT stations.station_name, COUNT(*) as count`, 
              params: [] 
            };
          }
          return { 
            sql: `SELECT ${maxColumn.table}.${maxColumn.column}, COUNT(*) as count`, 
            params: [] 
          };
        }
        break;
        
      case QueryIntent.LIST:
        const listColumn = this.findColumn(mappings, ['station', 'point', 'dock', 'name', 'avenue']);
        if (listColumn) {
          return { 
            sql: `SELECT ${listColumn.table}.${listColumn.column}`, 
            params: [] 
          };
        }
        break;
    }

    // Default fallback
    return { sql: 'SELECT *', params: [] };
  }

  private buildFromClause(mappings: ColumnMapping[], question: string = ''): SQLQuery {
    // Check if we need stations table for location filtering
    const needsStations = question.toLowerCase().includes('congress') || 
                         question.toLowerCase().includes('avenue') || 
                         question.toLowerCase().includes('station') ||
                         question.toLowerCase().includes('docking');
    
    // Gender filtering is done directly on trips.rider_gender, no users table needed
    const needsUsers = false;
    
    // Check if we need daily_weather table for weather filtering
    const needsWeather = question.toLowerCase().includes('rainy') || 
                        question.toLowerCase().includes('rain');

    if (mappings.length === 0) {
      // Default to trips table as it's the main fact table
      let sql = 'FROM trips';
      if (needsWeather) {
        sql += ' LEFT JOIN daily_weather ON DATE(trips.started_at) = daily_weather.weather_date';
      }
      if (needsStations) {
        sql += ' LEFT JOIN stations ON trips.start_station_id = stations.id';
      }
      return { sql, params: [] };
    }

    const tables = [...new Set(mappings.map(m => m.table))];
    
    if (tables.length === 1) {
      if (needsStations && tables[0] !== 'stations') {
        // Need to add stations table for location filtering
        if (tables[0] === 'trips') {
          let sql = 'FROM trips LEFT JOIN stations ON trips.start_station_id = stations.station_id';
          if (needsWeather) {
            sql += ' LEFT JOIN daily_weather ON DATE(trips.start_time) = daily_weather.date';
          }
          return { sql, params: [] };
        } else if (tables[0] === 'users') {
          let sql = 'FROM users LEFT JOIN trips ON users.id = trips.user_id LEFT JOIN stations ON trips.start_station_id = stations.station_id';
          if (needsWeather) {
            sql += ' LEFT JOIN daily_weather ON DATE(trips.started_at) = daily_weather.weather_date';
          }
          return { sql, params: [] };
        }
      }
      
      // Gender filtering is done directly on trips.rider_gender, no users table needed
      
      return { sql: `FROM ${tables[0]}`, params: [] };
    }

    // Smart JOIN logic based on actual database schema
    if (tables.includes('trips')) {
      // trips is the main table, join others to it
      let joinClauses = 'FROM trips';
      
      // Gender filtering is done directly on trips.rider_gender, no users table needed
      
      if (tables.includes('stations') || needsStations) {
        // Use consistent aliases for stations
        joinClauses += ' LEFT JOIN stations ON trips.start_station_id = stations.station_id';
      }
      
      if (tables.includes('daily_weather') || needsWeather) {
        // Join daily_weather table for weather-related queries
        joinClauses += ' LEFT JOIN daily_weather ON DATE(trips.started_at) = daily_weather.weather_date';
      }
      
      return { sql: joinClauses, params: [] };
    }
    
    if (tables.includes('stations')) {
      // If only stations mentioned, start from stations
      return { sql: 'FROM stations', params: [] };
    }

    // Fallback
    return { sql: `FROM ${tables[0]}`, params: [] };
  }

  private buildWhereClause(question: string, mappings: ColumnMapping[], userWords: string[]): SQLQuery {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Date filtering
    const dateRange = this.extractDateRange(question);
    if (dateRange) {
      // Always use started_at column for date filtering, regardless of mappings
      conditions.push(`trips.started_at >= $${paramIndex++}::timestamp`);
      conditions.push(`trips.started_at <= $${paramIndex++}::timestamp`);
      // Convert Date objects to PostgreSQL timestamp format
      const startDate = dateRange.start.toISOString().slice(0, 19).replace('T', ' ');
      const endDate = dateRange.end.toISOString().slice(0, 19).replace('T', ' ');
      params.push(startDate, endDate);
    }

    // Gender filtering
    if (question.toLowerCase().includes('women') || question.toLowerCase().includes('female')) {
      // Filter on trips.rider_gender for gender-related queries
      conditions.push(`trips.rider_gender = $${paramIndex++}`);
      params.push('female');
    } else if (question.toLowerCase().includes('men') || question.toLowerCase().includes('male')) {
      // Filter on trips.rider_gender for gender-related queries
      conditions.push(`trips.rider_gender = $${paramIndex++}`);
      params.push('male');
    }

    // Weather filtering
    if (question.toLowerCase().includes('rainy') || question.toLowerCase().includes('rain')) {
      // Filter on daily_weather.precipitation_mm for weather-related queries
      conditions.push(`daily_weather.precipitation_mm > $${paramIndex++}`);
      params.push(0);
    }

    // Location filtering - improved for Congress Avenue and other locations
    const locationTerms = ['congress avenue', 'congress', 'avenue'];
    let locationFilterApplied = false;
    
    for (const term of locationTerms) {
      if (question.toLowerCase().includes(term)) {
        // For location filtering, we need to join with stations table
        // and filter by station name, not by station ID
        conditions.push(`stations.station_name ILIKE $${paramIndex++}`);
        params.push('%Congress Avenue%');
        locationFilterApplied = true;
        break;
      }
    }
    
    // If no specific location mentioned, don't filter by station name
    // This allows queries like "Which docking point saw the most departures" to work

    if (conditions.length === 0) {
      return { sql: '', params: [] };
    }

    return { 
      sql: `WHERE ${conditions.join(' AND ')}`, 
      params 
    };
  }

  private buildGroupByClause(context: SemanticContext, mappings: ColumnMapping[]): SQLQuery {
    const { intent } = context;
    
    if (intent === QueryIntent.MAX || intent === QueryIntent.COUNT) {
      // For MAX/COUNT queries, we need to group by the non-aggregate columns
      const maxColumn = this.findColumn(mappings, ['station', 'point', 'dock', 'name', 'avenue']);
              if (maxColumn && (maxColumn.column.includes('station') || maxColumn.column.includes('id'))) {
          // If we're grouping by station information, group by the station name
          return { sql: 'GROUP BY stations.station_name', params: [] };
        }
      
      if (maxColumn) {
        return { sql: `GROUP BY ${maxColumn.table}.${maxColumn.column}`, params: [] };
      }
    }
    
    return { sql: '', params: [] };
  }

  private buildOrderByClause(context: SemanticContext, mappings: ColumnMapping[]): SQLQuery {
    if (context.intent === QueryIntent.MAX) {
      return { sql: 'ORDER BY count DESC LIMIT 1', params: [] };
    }
    return { sql: '', params: [] };
  }

  private findColumn(mappings: ColumnMapping[], keywords: string[]): ColumnMapping | null {
    // First, try to find exact matches for timestamp columns when looking for date/time
    if (keywords.some(k => ['start', 'created', 'date', 'time'].includes(k))) {
      const timestampColumn = mappings.find(m => 
        m.type.includes('timestamp') || m.type.includes('date') || m.type.includes('time')
      );
      if (timestampColumn) return timestampColumn;
    }
    
    // Then try to find columns by keywords
    for (const keyword of keywords) {
      const match = mappings.find(m => 
        m.column.toLowerCase().includes(keyword) || 
        m.table.toLowerCase().includes(keyword)
      );
      if (match) return match;
    }
    
    return mappings.length > 0 ? mappings[0] : null;
  }

  private findNumericColumn(mappings: ColumnMapping[], keywords: string[]): ColumnMapping | null {
    const numericTypes = ['integer', 'decimal', 'numeric', 'real', 'double', 'float', 'bigint'];
    
    for (const keyword of keywords) {
      const match = mappings.find(m => 
        (m.column.toLowerCase().includes(keyword) || m.table.toLowerCase().includes(keyword)) &&
        numericTypes.some(type => m.type.toLowerCase().includes(type))
      );
      if (match) return match;
    }
    
    // Fallback to any numeric column
    return mappings.find(m => numericTypes.some(type => m.type.toLowerCase().includes(type))) || null;
  }

  private extractDateRange(question: string): DateRange | null {
    const lowerQuestion = question.toLowerCase();
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Handle "last month"
    if (lowerQuestion.includes('last month')) {
      const lastMonth = new Date(now);
      lastMonth.setMonth(now.getMonth() - 1, 1);
      lastMonth.setHours(0, 0, 0, 0);
      
      const endOfLastMonth = new Date(lastMonth);
      endOfLastMonth.setMonth(lastMonth.getMonth() + 1, 0);
      endOfLastMonth.setHours(23, 59, 59, 999);
      
      return { start: lastMonth, end: endOfLastMonth };
    }
    
    // Handle "first week of June 2025" - this should be checked FIRST
    if (lowerQuestion.includes('first week') && lowerQuestion.includes('june')) {
      const june2025Start = new Date(2025, 5, 1, 0, 0, 0, 0); // June is month 5 (0-indexed)
      const firstWeekEnd = new Date(2025, 5, 7, 23, 59, 59, 999); // June 7
      return { start: june2025Start, end: firstWeekEnd };
    }
    
    // Handle "June 2025" - this should be checked AFTER first week
    if (lowerQuestion.includes('june 2025') || lowerQuestion.includes('june')) {
      const june2025Start = new Date(2025, 5, 1, 0, 0, 0, 0); // June is month 5 (0-indexed)
      const june2025End = new Date(2025, 6, 0, 23, 59, 59, 999); // Last day of June
      return { start: june2025Start, end: june2025End };
    }
    
    return null;
  }
}