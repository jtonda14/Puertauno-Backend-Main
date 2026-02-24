import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  // GET - Get expense account(s)
  if (req.method === 'GET') {
    try {
      const { id, accommodation_request_id, status } = req.query;

      // Get specific account by ID
      if (id) {
        const { data, error } = await supabase
          .from('expense_accounts')
          .select(`
            *,
            guests(id, first_name, last_name1, last_name2, document_number, email, phone),
            billing_companies(*),
            expense_items(*, expense_categories(name)),
            expense_payments(*)
          `)
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Expense account not found' });
          }
          throw error;
        }
        return res.status(200).json({ account: data });
      }

      // Get account by accommodation_request_id
      if (accommodation_request_id) {
        const { data, error } = await supabase
          .from('expense_accounts')
          .select(`
            *,
            guests(id, first_name, last_name1, last_name2, document_number, email, phone),
            billing_companies(*),
            expense_items(*, expense_categories(name)),
            expense_payments(*)
          `)
          .eq('accommodation_request_id', accommodation_request_id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Expense account not found for this reservation' });
          }
          throw error;
        }
        return res.status(200).json({ account: data });
      }

      // Get all accounts with optional status filter
      let query = supabase
        .from('expense_accounts')
        .select(`
          *,
          accommodation_requests(id, short_id, check_in, check_out, establishment_code),
          guests(id, first_name, last_name1, last_name2),
          billing_companies(id, company_name)
        `)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return res.status(200).json({ accounts: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - Create new expense account (usually called automatically when creating a reservation)
  if (req.method === 'POST') {
    const data = req.body;
    
    if (!data.accommodation_request_id) {
      return res.status(400).json({ error: 'Missing required field: accommodation_request_id' });
    }

    try {
      // Check if account already exists for this reservation
      const { data: existing } = await supabase
        .from('expense_accounts')
        .select('id')
        .eq('accommodation_request_id', data.accommodation_request_id)
        .single();

      if (existing) {
        return res.status(409).json({ error: 'Expense account already exists for this reservation', account_id: existing.id });
      }

      const accountData = {
        accommodation_request_id: data.accommodation_request_id,
        guest_id: data.guest_id || null,
        billing_company_id: data.billing_company_id || null,
        status: 'open',
        total_amount: 0,
        paid_amount: 0,
        notes: data.notes || null,
        user_id: user.id
      };

      const { data: created, error } = await supabase
        .from('expense_accounts')
        .insert([accountData])
        .select();

      if (error) throw error;
      return res.status(201).json({ success: true, account: created[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT - Update expense account
  if (req.method === 'PUT') {
    const data = req.body;
    const id = data && data.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }

    const allowedFields = ['guest_id', 'billing_company_id', 'status', 'notes'];
    const updateData = {};
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    });

    // If settling the account, set settled_at timestamp
    if (data.status === 'settled') {
      updateData.settled_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    try {
      // If trying to settle, verify balance
      if (data.status === 'settled') {
        const { data: account, error: fetchError } = await supabase
          .from('expense_accounts')
          .select('total_amount, paid_amount')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        if (parseFloat(account.paid_amount) < parseFloat(account.total_amount)) {
          return res.status(400).json({ 
            error: 'Cannot settle account with pending balance',
            total_amount: account.total_amount,
            paid_amount: account.paid_amount,
            pending: (parseFloat(account.total_amount) - parseFloat(account.paid_amount)).toFixed(2)
          });
        }
      }

      const { data: updated, error } = await supabase
        .from('expense_accounts')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Expense account not found' });
      }

      return res.status(200).json({ success: true, account: updated[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


