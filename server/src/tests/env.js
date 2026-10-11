// Runs before any module is loaded. Test-only secrets; never used outside tests.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.REFRESH_SECRET = 'test-refresh-secret';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
