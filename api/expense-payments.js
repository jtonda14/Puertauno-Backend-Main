import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  // Helper function to recalculate account paid amount
  async function recalculatePaidAmount(accountId) {
    const { data: payments, error } = await supabase
      .from('expense_payments')
      .select('amount')
      .eq('expense_account_id', accountId);

    if (error) throw error;

    const total = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);

    const { error: updateError } = await supabase
      .from('expense_accounts')
      .update({ paid_amount: total.toFixed(2) })
      .eq('id', accountId);

    if (updateError) throw updateError;

    return total;
  }

  // GET - Get expense payments
  if (req.method === 'GET') {
    try {
      const { expense_account_id, id } = req.query;

      if (id) {
        const { data, error } = await supabase
          .from('expense_payments')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Payment not found' });
          }
          throw error;
        }
        return res.status(200).json({ payment: data });
      }

      if (!expense_account_id) {
        return res.status(400).json({ error: 'Missing expense_account_id parameter' });
      }

      const { data, error } = await supabase
        .from('expense_payments')
        .select('*')
        .eq('expense_account_id', expense_account_id)
        .order('payment_date', { ascending: false });
      
      if (error) throw error;
      return res.status(200).json({ payments: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - Create new payment
  if (req.method === 'POST') {
    const data = req.body;
    
    if (!data.expense_account_id) {
      return res.status(400).json({ error: 'Missing required field: expense_account_id' });
    }
    if (data.amount === undefined || data.amount === null || parseFloat(data.amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (!data.payment_method) {
      return res.status(400).json({ error: 'Missing required field: payment_method' });
    }

    const validMethods = ['cash', 'card', 'transfer', 'other'];
    if (!validMethods.includes(data.payment_method)) {
      return res.status(400).json({ error: `Invalid payment_method. Valid options: ${validMethods.join(', ')}` });
    }

    try {
      // Check if account exists and is open
      const { data: account, error: accountError } = await supabase
        .from('expense_accounts')
        .select('id, status, total_amount, paid_amount')
        .eq('id', data.expense_account_id)
        .single();

      if (accountError) {
        if (accountError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Expense account not found' });
        }
        throw accountError;
      }

      if (account.status !== 'open') {
        return res.status(400).json({ error: 'Cannot add payments to a closed account' });
      }

      const paymentData = {
        expense_account_id: data.expense_account_id,
        amount: parseFloat(data.amount).toFixed(2),
        payment_method: data.payment_method,
        payment_method_detail: data.payment_method_detail || null,
        reference: data.reference || null,
        payment_date: data.payment_date || new Date().toISOString(),
        user_id: user.id
      };

      const { data: created, error } = await supabase
        .from('expense_payments')
        .insert([paymentData])
        .select();

      if (error) throw error;

      // Recalculate paid amount
      const newPaidAmount = await recalculatePaidAmount(data.expense_account_id);

      // Check if account is fully paid
      const isFullyPaid = newPaidAmount >= parseFloat(account.total_amount);

      return res.status(201).json({ 
        success: true, 
        payment: created[0],
        account_paid_amount: newPaidAmount.toFixed(2),
        account_total_amount: account.total_amount,
        is_fully_paid: isFullyPaid
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE - Delete payment
  if (req.method === 'DELETE') {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    try {
      // Get payment to check account status and get account_id
      const { data: payment, error: fetchError } = await supabase
        .from('expense_payments')
        .select('expense_account_id, expense_accounts(status)')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Payment not found' });
        }
        throw fetchError;
      }

      if (payment.expense_accounts.status !== 'open') {
        return res.status(400).json({ error: 'Cannot delete payments from a closed account' });
      }

      const accountId = payment.expense_account_id;

      const { error } = await supabase
        .from('expense_payments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Recalculate paid amount
      const newPaidAmount = await recalculatePaidAmount(accountId);

      return res.status(200).json({ 
        success: true,
        account_paid_amount: newPaidAmount.toFixed(2)
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


