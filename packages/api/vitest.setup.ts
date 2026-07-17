// Local-dev fallbacks only — CI sets these explicitly via the workflow's env
// block, and those take precedence since ??= only applies when unset.
process.env.DATABASE_URL ??= 'postgresql://devaudit:test@localhost:5555/devaudit_test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
