import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  // GET - Get all available statuses
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('accommodation_status')
        .select('*');
      
      if (error) throw error;
      return res.status(200).json({ statuses: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT - Update status of an accommodation request
  if (req.method === 'PUT') {
    const { id, status } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Missing status in body' });
    }

    // Validate that the status exists
    const validStatuses = ['checked out', 'format_error', 'ok', 'send_error', 'to check in'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status', 
        validStatuses 
      });
    }

    try {
      // Si se intenta hacer check-out, verificar que la cuenta de gastos esté saldada
      if (status === 'checked out') {
        const { data: expenseAccount, error: expenseError } = await supabase
          .from('expense_accounts')
          .select('id, total_amount, paid_amount, status')
          .eq('accommodation_request_id', id)
          .single();

        if (expenseError && expenseError.code !== 'PGRST116') {
          throw expenseError;
        }

        if (expenseAccount) {
          const totalAmount = parseFloat(expenseAccount.total_amount) || 0;
          const paidAmount = parseFloat(expenseAccount.paid_amount) || 0;
          const pendingAmount = totalAmount - paidAmount;

          if (pendingAmount > 0) {
            return res.status(400).json({
              error: 'Cannot check out with pending balance',
              error_code: 'PENDING_BALANCE',
              total_amount: totalAmount.toFixed(2),
              paid_amount: paidAmount.toFixed(2),
              pending_amount: pendingAmount.toFixed(2)
            });
          }
        }
      }

      const { data: updated, error } = await supabase
        .from('accommodation_requests')
        .update({ status })
        .eq('id', id)
        .select();

      if (error) throw error;
      
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Accommodation request not found' });
      }

      // Si el check-out es exitoso, marcar la cuenta de gastos como saldada
      if (status === 'checked out') {
        const { error: settleError } = await supabase
          .from('expense_accounts')
          .update({ 
            status: 'settled',
            settled_at: new Date().toISOString()
          })
          .eq('accommodation_request_id', id);

        if (settleError) {
          console.error('Error settling expense account:', settleError);
          // No fallar la operación principal
        }
      }

      return res.status(200).json({ 
        success: true, 
        accommodation_request: updated[0] 
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}

