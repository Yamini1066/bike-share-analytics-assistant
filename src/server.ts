import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
import { QueryService } from './query_service';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const queryService = new QueryService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main query endpoint
app.post('/query', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        sql: '',
        result: null,
        error: 'Question is required and must be a string'
      });
    }

    console.log(`Processing query: "${question}"`);
    
    const response = await queryService.processQuery(question);
    
    // Log the response for debugging
    console.log(`Generated SQL: ${response.sql}`);
    console.log(`Result: ${JSON.stringify(response.result)}`);
    
    if (response.error) {
      console.error(`Query error: ${response.error}`);
      return res.status(500).json(response);
    }

    res.json(response);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      sql: '',
      result: null,
      error: 'Internal server error'
    });
  }
});

// Serve the chat UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'premium_ui.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    sql: '',
    result: null,
    error: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await queryService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await queryService.close();
  process.exit(0);
});

async function startServer() {
  try {
    // Initialize the query service
    await queryService.initialize();
    
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📊 Query endpoint: http://localhost:${port}/query`);
      console.log(`🌐 Web interface: http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;