const { createRepo } = require('./_factory');

// Não exponho updatePassword/passwordHash via repo CRUD — senha vai por endpoint dedicado.
const base = createRepo('users', { orderBy: 'created_at DESC' });

module.exports = { ...base };
