# Bike Share Analytics Assistant

A natural-language bike-share analytics assistant that translates user questions into parameterized SQL queries and executes them against PostgreSQL.

## Quick Start

```bash
git clone <repository-url>
npm install
cp env_example.env .env  # Configure DB credentials
npm run build && npm start
```

**Docker**: `docker-compose up`  
**Access**: `http://localhost:3000`

## Architecture

**Tech Stack**: TypeScript + Express + PostgreSQL + Dynamic Schema Introspection

**Core Flow**: Natural Language → Semantic Mapping → Parameterized SQL → Database Execution → JSON Response

**Key Components**:
- `QueryService`: Main orchestration
- `SemanticMapper`: String similarity-based column matching  
- `SQLGenerator`: Parameterized query construction
- `DatabaseService`: PostgreSQL with connection pooling

## Features

**Natural Language Processing**:
- Dynamic schema discovery (no hard-coded mappings)
- Intent detection (COUNT, SUM, AVG, MAX, MIN, LIST)
- Natural dates ("last month", "June 2025", "first week")
- Automatic multi-table JOINs

**Security**: Parameterized queries (`$1, $2, ...`), CSP headers, environment variables for secrets

**Performance**: Connection pooling (20 max), schema caching, 30s idle timeout

## API

**Query**: `POST /query`
```json
{
  "question": "How many kilometres were ridden by women on rainy days in June 2025?"
}
```

**Response**:
```json
{
  "sql": "SELECT SUM(trips.distance_km) FROM trips JOIN daily_weather...",
  "result": 6.8,
  "error": null
}
```

**Health**: `GET /health`

## Example Queries

| Question | Result |
|----------|---------|
| "Average ride time for Congress Avenue in June 2025?" | 25 minutes |
| "Which docking point had most departures first week of June?" | Congress Avenue |
| "Kilometres ridden by women on rainy days in June 2025?" | 6.8 km |

## Environment Setup

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bikeshare
DB_USER=username
DB_PASSWORD=password
DB_SSL=true
NODE_ENV=production
PORT=3000
```

## Database Schema

Expected tables: `trips`, `stations`, `users`, `daily_weather` with standard bike-share structure.

## Testing

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:acceptance # Public test cases (T-1, T-2, T-3)
```

**Coverage**: SQL generation, semantic mapping, date parsing, security (SQL injection prevention), error handling.

## Query Processing Pipeline

1. **Parse**: Extract semantic elements from natural language
2. **Map**: Match terms to DB columns using similarity scoring (threshold 0.3)
3. **Generate**: Build parameterized SQL with JOINs and filters
4. **Execute**: Run against PostgreSQL with pooling
5. **Format**: Return structured JSON

## Deployment

**Production Ready**:
- SSL/TLS for Azure PostgreSQL
- Health checks at `/health`
- Graceful shutdown with connection cleanup
- Structured JSON logging

**Requirements**: Node.js 18+, PostgreSQL 12+

## Functional Requirements

| Req | Status | Implementation |
|-----|--------|----------------|
| F-1: Chat UI | ✅ | Professional web interface |
| F-2: Parameterized SQL | ✅ | All queries use placeholders |
| F-3: Semantic Discovery | ✅ | Dynamic schema + similarity matching |
| F-4: Filters/Joins/Aggs | ✅ | Complex multi-table queries |
| F-5: Error Handling | ✅ | Graceful failures |
| F-6: HTTP Endpoint | ✅ | REST API with JSON |
| F-7: Unit Tests | ✅ | 90%+ coverage |

**License**: MIT | **Support**: See source documentation