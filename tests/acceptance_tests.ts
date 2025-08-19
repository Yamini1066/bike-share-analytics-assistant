import request from 'supertest';
import app from './server';

describe('Public Acceptance Tests', () => {
  // Test cases from the assignment
  const testCases = [
    {
      name: 'T-1: Average ride time for journeys starting at Congress Avenue in June 2025',
      question: 'What was the average ride time for journeys that started at Congress Avenue in June 2025?',
      expectedAnswer: 25,
      tolerance: 1 // Allow ±1 minute tolerance
    },
    {
      name: 'T-2: Docking point with most departures in first week of June 2025',
      question: 'Which docking point saw the most departures during the first week of June 2025?',
      expectedAnswer: 'Congress Avenue'
    },
    {
      name: 'T-3: Kilometres ridden by women on rainy days in June 2025',
      question: 'How many kilometres were ridden by women on rainy days in June 2025?',
      expectedAnswer: 6.8,
      tolerance: 0.1 // Allow ±0.1 km tolerance
    }
  ];

  beforeAll(async () => {
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  test.each(testCases)('$name', async ({ question, expectedAnswer, tolerance }) => {
    const response = await request(app)
      .post('/query')
      .send({ question })
      .expect(200);

    expect(response.body).toHaveProperty('sql');
    expect(response.body).toHaveProperty('result');
    expect(response.body.error).toBeNull();

    const result = response.body.result;
    
    if (typeof expectedAnswer === 'number' && tolerance) {
      expect(typeof result).toBe('number');
      expect(Math.abs(result - expectedAnswer)).toBeLessThanOrEqual(tolerance);
    } else {
      expect(result).toBe(expectedAnswer);
    }

    // Verify SQL was generated
    expect(response.body.sql).toBeTruthy();
    expect(response.body.sql.length).toBeGreaterThan(0);
  });

  test('Health check endpoint', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
  });

  test('Invalid question returns error', async () => {
    const response = await request(app)
      .post('/query')
      .send({ question: '' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.result).toBeNull();
  });

  test('Missing question returns error', async () => {
    const response = await request(app)
      .post('/query')
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.result).toBeNull();
  });
});