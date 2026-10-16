import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createExpressApp } from '../server/app';

describe('Phase 5: Projects Workflow & Security Enforcement', () => {
  const app = createExpressApp();

  it('rejects unauthenticated project list requests with 401', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects unauthenticated project creation requests with 401', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Unauthenticated Test Project',
        aspectRatio: '16:9',
      });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated project fetch by ID with 401', async () => {
    const res = await request(app).get('/api/projects/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated project duplication with 401', async () => {
    const res = await request(app).post('/api/projects/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/duplicate');
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated project archiving with 401', async () => {
    const res = await request(app).delete('/api/projects/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
    expect(res.status).toBe(401);
  });
});
