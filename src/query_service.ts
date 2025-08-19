import { DatabaseService } from './database_service';
import { SemanticMapper } from './semantic_mapper';
import { SQLGenerator } from './sql_generator';

export interface QueryResponse {
  sql: string;
  result: any[] | number | string | null;
  error: string | null;
}

export class QueryService {
  private dbService: DatabaseService;
  private semanticMapper: SemanticMapper;
  private sqlGenerator: SQLGenerator;
  private isInitialized: boolean = false;

  constructor() {
    this.dbService = new DatabaseService();
    this.semanticMapper = new SemanticMapper();
    this.sqlGenerator = new SQLGenerator(this.semanticMapper);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const schema = await this.dbService.getSchema();
      this.semanticMapper.setSchema(schema);
      this.isInitialized = true;
      console.log(`Initialized with ${schema.length} tables`);
    } catch (error) {
      console.error('Failed to initialize QueryService:', error);
      throw error;
    }
  }

  async processQuery(question: string): Promise<QueryResponse> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!question || question.trim().length === 0) {
        return {
          sql: '',
          result: null,
          error: 'Question cannot be empty'
        };
      }

      // Generate SQL from natural language
      const { sql, params } = this.sqlGenerator.generateSQL(question);
      
      if (!sql || sql.trim().length === 0) {
        return {
          sql: '',
          result: null,
          error: 'Unable to generate SQL query from the question'
        };
      }

      // Execute the query
      const result = await this.dbService.executeQuery(sql, params);
      
      // Format the result based on query type
      const formattedResult = this.formatResult(result, question);

      return {
        sql,
        result: formattedResult,
        error: null
      };

    } catch (error) {
      console.error('Query processing error:', error);
      
      let errorMessage = 'An error occurred while processing the query';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        sql: '',
        result: null,
        error: errorMessage
      };
    }
  }

  private formatResult(rows: any[], question: string): any[] | number | string | null {
    if (!rows || rows.length === 0) {
      return null;
    }

    const lowerQuestion = question.toLowerCase();

    // Handle single value results (COUNT, AVG, SUM)
    if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
      const value = Object.values(rows[0])[0];
      
      // Format specific result types
      if (lowerQuestion.includes('average') && typeof value === 'number') {
        return Math.round(value); // Round to nearest integer for minutes
      }
      
      if (lowerQuestion.includes('kilometres') || lowerQuestion.includes('km')) {
        return parseFloat(Number(value).toFixed(1)); // Format to 1 decimal place for km
      }
      
      return value as string | number | any[] | null;
    }

    // Handle single row with single string value (like station name)
    if (rows.length === 1 && typeof Object.values(rows[0])[0] === 'string') {
      return Object.values(rows[0])[0] as string | number | any[] | null;
    }

    // Return full rows for complex results
    return rows;
  }

  async close(): Promise<void> {
    await this.dbService.close();
  }
}