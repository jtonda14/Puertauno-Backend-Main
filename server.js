import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3051;

app.use(cors());
app.use(express.json());

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  };
}

// Map routes to handlers dynamically
app.all('/api/accommodation-auth-push', async (req, res) => {
  const mod = await import('./api/accommodation-auth-push.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/accommodation-requests-full', async (req, res) => {
  const mod = await import('./api/accommodation-requests-full.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/accommodation-requests', async (req, res) => {
  const mod = await import('./api/accommodation-requests.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/accommodations', async (req, res) => {
  const mod = await import('./api/accommodations.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/guests', async (req, res) => {
  const mod = await import('./api/guests.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/links', async (req, res) => {
  const mod = await import('./api/links.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/submit-accommodation', async (req, res) => {
  const mod = await import('./api/submit-accommodation.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/vehicle-auth-push', async (req, res) => {
  const mod = await import('./api/vehicle-auth-push.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/vehicles', async (req, res) => {
  const mod = await import('./api/vehicles.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/rooms', async (req, res) => {
  const mod = await import('./api/rooms.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/room-type', async (req, res) => {
  const mod = await import('./api/room-type.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/room-assignments', async (req, res) => {
  const mod = await import('./api/room-assignments.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/room-timeline', async (req, res) => {
  const mod = await import('./api/room-timeline.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/daily-operations', async (req, res) => {
  const mod = await import('./api/daily-operations.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/accommodation-status', async (req, res) => {
  const mod = await import('./api/accommodation-status.js');
  return wrap(mod.default)(req, res);
});

// Expense management routes
app.all('/api/expense-categories', async (req, res) => {
  const mod = await import('./api/expense-categories.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/billing-companies', async (req, res) => {
  const mod = await import('./api/billing-companies.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/expense-accounts', async (req, res) => {
  const mod = await import('./api/expense-accounts.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/expense-items', async (req, res) => {
  const mod = await import('./api/expense-items.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/expense-payments', async (req, res) => {
  const mod = await import('./api/expense-payments.js');
  return wrap(mod.default)(req, res);
});

app.all('/api/expense-accounts/invoice', async (req, res) => {
  const mod = await import('./api/expense-invoice.js');
  return wrap(mod.default)(req, res);
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Puertauno Backend Main (local dev)' });
});

app.listen(port, () => {
  console.log(`Backend Main server running at http://localhost:${port}`);
});


