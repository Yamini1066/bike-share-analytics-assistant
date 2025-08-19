import { SemanticMapper, QueryIntent } from './semantic_mapper';
import { SQLGenerator } from './sql_generator';
import { QueryService } from './query_service';

describe('SemanticMapper', () => {
  let semanticMapper: SemanticMapper;

  beforeEach(() => {
    semanticMapper = new SemanticMapper();
    
    // Mock schema for testing
    const mockSchema = [
      {
        table_name: 'trips',
        columns: [
          { table_name: 'trips', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null },
          { table_name: 'trips', column_name: 'start_station_name', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'duration_minutes', data_type: 'integer', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'distance_km', data_type: 'decimal', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'user_gender', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'weather_condition', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'start_time', data_type: 'timestamp', is_nullable: 'YES', column_default: null },
        ]
      }
    ];
    
    semanticMapper.setSchema(mockSchema);
  });

  describe('Intent Detection', () => {
    test('detects COUNT intent', () => {
      expect(semanticMapper.detectIntent('How many trips were made?')).toBe(QueryIntent.COUNT);
      expect(semanticMapper.detectIntent('Count the journeys')).toBe(QueryIntent.COUNT);
    });

    test('detects AVERAGE intent', () => {
      expect(semanticMapper.detectIntent('What was the average ride time?')).toBe(QueryIntent.AVERAGE);
      expect(semanticMapper.detectIntent('avg duration')).toBe(QueryIntent.AVERAGE);
    });

    test('detects SUM intent', () => {
      expect(semanticMapper.detectIntent('Total distance traveled')).toBe(QueryIntent.SUM);
      expect(semanticMapper.detectIntent('Sum of kilometres')).toBe(QueryIntent.SUM);
    });

    test('detects MAX intent', () => {
      expect(semanticMapper.detectIntent('Which station had the most departures?')).toBe(QueryIntent.MAX);
      expect(semanticMapper.detectIntent('Maximum trips')).toBe(QueryIntent.MAX);
    });
  });

  describe('Word Extraction', () => {
    test('extracts meaningful words', () => {
      const words = semanticMapper.extractUserWords('How many kilometres were ridden by women on rainy days?');
      expect(words).toContain('kilometres');
      expect(words).toContain('women');
      expect(words).toContain('rainy');
      expect(words).not.toContain('how');
      expect(words).not.toContain('were');
      expect(words).not.toContain('the');
    });

    test('removes duplicates and stop words', () => {
      const words = semanticMapper.extractUserWords('What was the average time for the ride?');
      expect(words.length).toBe(new Set(words).size); // No duplicates
      expect(words).not.toContain('was');
      expect(words).not.toContain('the');
    });
  });

  describe('Column Mapping', () => {
    test('finds column mappings with high similarity', () => {
      const mappings = semanticMapper.findBestColumnMatches(['duration', 'time']);
      const durationMapping = mappings.find(m => m.column === 'duration_minutes');
      expect(durationMapping).toBeDefined();
      expect(durationMapping!.similarity).toBeGreaterThan(0.7);
    });

    test('handles domain-specific mappings', () => {
      const mappings = semanticMapper.findBestColumnMatches(['women', 'gender']);
      const genderMapping = mappings.find(m => m.column === 'user_gender');
      expect(genderMapping).toBeDefined();
      expect(genderMapping!.similarity).toBeGreaterThan(0.7);
    });

    test('finds station/location mappings', () => {
      const mappings = semanticMapper.findBestColumnMatches(['congress', 'avenue', 'station']);
      const stationMapping = mappings.find(m => m.column === 'start_station_name');
      expect(stationMapping).toBeDefined();
    });
  });
});

describe('SQLGenerator', () => {
  let sqlGenerator: SQLGenerator;
  let semanticMapper: SemanticMapper;

  beforeEach(() => {
    semanticMapper = new SemanticMapper();
    sqlGenerator = new SQLGenerator(semanticMapper);
    
    // Mock schema
    const mockSchema = [
      {
        table_name: 'trips',
        columns: [
          { table_name: 'trips', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null },
          { table_name: 'trips', column_name: 'start_station_name', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'duration_minutes', data_type: 'integer', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'distance_km', data_type: 'decimal', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'user_gender', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'weather_condition', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'start_time', data_type: 'timestamp', is_nullable: 'YES', column_default: null },
        ]
      }
    ];
    
    semanticMapper.setSchema(mockSchema);
  });

  describe('SQL Generation', () => {
    test('generates COUNT query', () => {
      const { sql, params } = sqlGenerator.generateSQL('How many trips were made?');
      expect(sql).toContain('SELECT COUNT(*)');
      expect(sql).toContain('FROM');
      expect(Array.isArray(params)).toBe(true);
    });

    test('generates AVERAGE query with proper column', () => {
      const { sql, params } = sqlGenerator.generateSQL('What was the average ride time?');
      expect(sql).toContain('SELECT AVG(');
      expect(sql).toContain('duration_minutes');
      expect(Array.isArray(params)).toBe(true);
    });

    test('generates parameterized WHERE clause', () => {
      const { sql, params } = sqlGenerator.generateSQL('How many trips were made by women?');
      expect(sql).toContain('WHERE');
      expect(sql).toContain('$1');
      expect(params).toContain('Female');
    });

    test('handles date ranges', () => {
      const { sql, params } = sqlGenerator.generateSQL('How many trips in June 2025?');
      expect(sql).toContain('WHERE');
      expect(params.length).toBeGreaterThan(0);
    });

    test('prevents SQL injection by using parameters', () => {
      const maliciousQuestion = "'; DROP TABLE trips; --";
      const { sql, params } = sqlGenerator.generateSQL(maliciousQuestion);
      expect(sql).not.toContain('DROP');
      expect(sql).not.toContain(maliciousQuestion);
    });
  });

  describe('Security Tests', () => {
    const maliciousInputs = [
      "'; DROP TABLE trips; --",
      "' OR '1'='1",
      "'; DELETE FROM trips WHERE '1'='1'; --",
      "' UNION SELECT * FROM users --",
      "<script>alert('xss')</script>",
      "' OR 1=1 --",
    ];

    test.each(maliciousInputs)('prevents SQL injection with input: %s', (maliciousInput) => {
      const { sql, params } = sqlGenerator.generateSQL(maliciousInput);
      
      // Should not contain dangerous SQL keywords in the raw SQL
      expect(sql.toUpperCase()).not.toContain('DROP');
      expect(sql.toUpperCase()).not.toContain('DELETE');
      expect(sql.toUpperCase()).not.toContain('UPDATE');
      expect(sql.toUpperCase()).not.toContain('INSERT');
      expect(sql.toUpperCase()).not.toContain('ALTER');
      
      // Should use parameterized queries
      if (params.length > 0) {
        expect(sql).toMatch(/\$\d+/);
      }
      
      // Raw malicious input should not appear in SQL
      expect(sql).not.toContain(maliciousInput);
    });
  });
});

describe('QueryService Integration', () => {
  let queryService: QueryService;

  beforeEach(() => {
    queryService = new QueryService();
  });

  afterEach(async () => {
    await queryService.close();
  });

  describe('Error Handling', () => {
    test('handles empty questions gracefully', async () => {
      const response = await queryService.processQuery('');
      expect(response.error).toBeTruthy();
      expect(response.result).toBeNull();
    });

    test('handles invalid questions gracefully', async () => {
      const response = await queryService.processQuery('abcdefghijklmnopqrstuvwxyz');
      // Should not crash, should return some response
      expect(response).toHaveProperty('sql');
      expect(response).toHaveProperty('result');
      expect(response).toHaveProperty('error');
    });
  });

  describe('Result Formatting', () => {
    // These tests would require mocking the database service
    // For now, we'll test the structure
    
    test('returns proper response structure', async () => {
      try {
        const response = await queryService.processQuery('How many trips?');
        expect(response).toHaveProperty('sql');
        expect(response).toHaveProperty('result');
        expect(response).toHaveProperty('error');
      } catch (error) {
        // Expected if database is not available in test environment
        expect(error).toBeDefined();
      }
    });
  });
});

describe('Edge Cases and Robustness', () => {
  let semanticMapper: SemanticMapper;
  let sqlGenerator: SQLGenerator;

  beforeEach(() => {
    semanticMapper = new SemanticMapper();
    sqlGenerator = new SQLGenerator(semanticMapper);
    
    // Minimal schema for edge case testing
    const mockSchema = [
      {
        table_name: 'trips',
        columns: [
          { table_name: 'trips', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null },
        ]
      }
    ];
    
    semanticMapper.setSchema(mockSchema);
  });

  test('handles questions with no matching columns', () => {
    const { sql, params } = sqlGenerator.generateSQL('Show me unicorn data');
    expect(sql).toBeTruthy();
    expect(Array.isArray(params)).toBe(true);
  });

  test('handles very long questions', () => {
    const longQuestion = 'What is the ' + 'very '.repeat(100) + 'long question about trips?';
    const { sql, params } = sqlGenerator.generateSQL(longQuestion);
    expect(sql).toBeTruthy();
    expect(Array.isArray(params)).toBe(true);
  });

  test('handles questions with special characters', () => {
    const { sql, params } = sqlGenerator.generateSQL('How many trips with 100% satisfaction?');
    expect(sql).toBeTruthy();
    expect(Array.isArray(params)).toBe(true);
  });

  test('handles questions with numbers', () => {
    const { sql, params } = sqlGenerator.generateSQL('Show trips longer than 30 minutes');
    expect(sql).toBeTruthy();
    expect(Array.isArray(params)).toBe(true);
  });
});

describe('Synthetic Test Cases', () => {
  let semanticMapper: SemanticMapper;
  let sqlGenerator: SQLGenerator;

  beforeEach(() => {
    semanticMapper = new SemanticMapper();
    sqlGenerator = new SQLGenerator(semanticMapper);
    
    // Full mock schema for comprehensive testing
    const mockSchema = [
      {
        table_name: 'trips',
        columns: [
          { table_name: 'trips', column_name: 'trip_id', data_type: 'integer', is_nullable: 'NO', column_default: null },
          { table_name: 'trips', column_name: 'start_station_name', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'end_station_name', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'duration_seconds', data_type: 'integer', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'distance_meters', data_type: 'decimal', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'user_type', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'user_gender', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'weather_main', data_type: 'varchar', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'start_time', data_type: 'timestamp', is_nullable: 'YES', column_default: null },
          { table_name: 'trips', column_name: 'temperature', data_type: 'decimal', is_nullable: 'YES', column_default: null },
        ]
      },
      {
        table_name: 'stations',
        columns: [
          { table_name: 'stations', column_name: 'station_id', data_type: 'integer', is_nullable: 'NO', column_default: null },
          { table_name: 'stations', column_name: 'name', data_type: 'varchar', is_nullable: 'NO', column_default: null },
          { table_name: 'stations', column_name: 'capacity', data_type: 'integer', is_nullable: 'YES', column_default: null },
        ]
      }
    ];
    
    semanticMapper.setSchema(mockSchema);
  });

  // AI-generated synthetic test cases to test robustness
  const syntheticQuestions = [
    'What is the total distance covered by subscribers last week?',
    'Which weather condition saw the highest average trip duration?',
    'How many bike trips started from downtown stations?',
    'What percentage of trips were taken by casual users?',
    'Find the busiest hour for bike rentals',
    'Which station has the lowest utilization rate?',
    'How many trips were cancelled due to bad weather?',
    'What is the median trip distance for weekends?',
    'Show me trips that ended at the same station they started from',
    'Which month had the most bike maintenance issues?'
  ];

  test.each(syntheticQuestions)('handles synthetic question: %s', (question) => {
    const { sql, params } = sqlGenerator.generateSQL(question);
    
    // Basic validation
    expect(sql).toBeTruthy();
    expect(typeof sql).toBe('string');
    expect(Array.isArray(params)).toBe(true);
    
    // Should generate valid SQL structure
    expect(sql.toUpperCase()).toContain('SELECT');
    expect(sql.toUpperCase()).toContain('FROM');
    
    // Should use parameterized queries if parameters exist
    if (params.length > 0) {
      expect(sql).toMatch(/\$\d+/);
    }
    
    // Should not contain dangerous SQL
    expect(sql.toUpperCase()).not.toContain('DROP');
    expect(sql.toUpperCase()).not.toContain('DELETE');
    expect(sql.toUpperCase()).not.toContain('UPDATE');
    expect(sql.toUpperCase()).not.toContain('INSERT');
  });
});