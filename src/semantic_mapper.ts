import * as stringSimilarity from 'string-similarity';
import { ColumnInfo, TableInfo } from './database_service';

export interface ColumnMapping {
  table: string;
  column: string;
  similarity: number;
  type: string;
}

export interface SemanticContext {
  tables: TableInfo[];
  userWords: string[];
  intent: QueryIntent;
}

export enum QueryIntent {
  COUNT = 'count',
  AVERAGE = 'average',
  SUM = 'sum',
  MAX = 'max',
  MIN = 'min',
  LIST = 'list',
  FILTER = 'filter'
}

export class SemanticMapper {
  private schema: TableInfo[] = [];
  private columnCache: Map<string, ColumnMapping[]> = new Map();

  setSchema(schema: TableInfo[]): void {
    this.schema = schema;
    this.columnCache.clear();
  }

  detectIntent(question: string): QueryIntent {
    const lowerQuestion = question.toLowerCase();
    
    // Check for distance/kilometres first - these should be SUM queries
    if (lowerQuestion.includes('kilometres') || lowerQuestion.includes('km') || 
        lowerQuestion.includes('distance') || lowerQuestion.includes('miles')) {
      return QueryIntent.SUM;
    }
    
    if (lowerQuestion.includes('average') || lowerQuestion.includes('avg')) {
      return QueryIntent.AVERAGE;
    }
    if (lowerQuestion.includes('sum') || lowerQuestion.includes('total')) {
      return QueryIntent.SUM;
    }
    if (lowerQuestion.includes('maximum') || lowerQuestion.includes('max') || lowerQuestion.includes('most')) {
      return QueryIntent.MAX;
    }
    if (lowerQuestion.includes('minimum') || lowerQuestion.includes('min') || lowerQuestion.includes('least')) {
      return QueryIntent.MIN;
    }
    if (lowerQuestion.includes('count') || lowerQuestion.includes('how many')) {
      return QueryIntent.COUNT;
    }
    if (lowerQuestion.includes('which') || lowerQuestion.includes('what') || lowerQuestion.includes('list')) {
      return QueryIntent.LIST;
    }
    
    return QueryIntent.FILTER;
  }

  extractUserWords(question: string): string[] {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'what', 'when', 'where', 'why', 'how', 'which', 'who', 'was', 'were', 'is', 'are', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);

    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates
  }

  findBestColumnMatches(userWords: string[], minSimilarity: number = 0.3): ColumnMapping[] {
    const cacheKey = userWords.join('|');
    if (this.columnCache.has(cacheKey)) {
      return this.columnCache.get(cacheKey)!;
    }

    const mappings: ColumnMapping[] = [];

    for (const table of this.schema) {
      for (const column of table.columns) {
        const columnName = column.column_name.toLowerCase();
        const tableName = table.table_name.toLowerCase();
        
        // Check direct matches and semantic similarity
        for (const word of userWords) {
          let similarity = 0;
          
          // Direct match bonus
          if (columnName.includes(word) || word.includes(columnName)) {
            similarity = Math.max(similarity, 0.9);
          }
          
          // Enhanced semantic similarity with synonyms
          const synonyms = this.getSynonyms(word);
          for (const synonym of synonyms) {
            if (columnName.includes(synonym) || synonym.includes(columnName)) {
              similarity = Math.max(similarity, 0.8);
            }
          }
          
          // Semantic similarity
          const columnSimilarity = stringSimilarity.compareTwoStrings(word, columnName);
          similarity = Math.max(similarity, columnSimilarity);
          
          // Table name relevance
          if (tableName.includes(word) || word.includes(tableName)) {
            similarity += 0.1;
          }
          
          if (similarity >= minSimilarity) {
            mappings.push({
              table: tableName,
              column: columnName,
              similarity,
              type: column.data_type
            });
          }
        }
      }
    }

    // Sort by similarity and cache
    mappings.sort((a, b) => b.similarity - a.similarity);
    this.columnCache.set(cacheKey, mappings);
    return mappings;
  }

  private getSynonyms(word: string): string[] {
    const synonymMap: { [key: string]: string[] } = {
      'time': ['duration', 'minutes', 'hours', 'ride_time'],
      'duration': ['time', 'minutes', 'hours', 'ride_time'],
      'minutes': ['time', 'duration', 'hours', 'ride_time'],
      'station': ['docking', 'point', 'stop', 'hub', 'avenue'],
      'docking': ['station', 'point', 'stop', 'hub', 'avenue'],
      'point': ['station', 'docking', 'stop', 'hub', 'avenue'],
      'departure': ['start', 'beginning', 'leave', 'depart'],
      'start': ['departure', 'beginning', 'leave', 'depart'],
      'kilometres': ['km', 'distance', 'miles', 'length'],
      'km': ['kilometres', 'distance', 'miles', 'length'],
      'distance': ['kilometres', 'km', 'miles', 'length'],
      'women': ['female', 'woman', 'girl'],
      'female': ['women', 'woman', 'girl'],
      'rainy': ['rain', 'wet', 'stormy', 'precipitation'],
      'rain': ['rainy', 'wet', 'stormy', 'precipitation'],
      'congress': ['avenue', 'street', 'road'],
      'avenue': ['congress', 'street', 'road']
    };
    
    return synonymMap[word.toLowerCase()] || [];
  }

  buildSemanticContext(question: string): SemanticContext {
    const userWords = this.extractUserWords(question);
    const intent = this.detectIntent(question);
    
    return {
      tables: this.schema,
      userWords,
      intent
    };
  }
}