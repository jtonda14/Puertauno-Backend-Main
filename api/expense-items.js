import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  // Helper function to recalculate account total
  async function recalculateAccountTotal(accountId) {
    const { data: items, error } = await supabase
      .from('expense_items')
      .select('total_price')
      .eq('expense_account_id', accountId);

    if (error) throw error;

    const total = items.reduce((sum, item) => sum + parseFloat(item.total_price), 0);

    const { error: updateError } = await supabase
      .from('expense_accounts')
      .update({ total_amount: total.toFixed(2) })
      .eq('id', accountId);

    if (updateError) throw updateError;

    return total;
  }

  // GET - Get expense items
  if (req.method === 'GET') {
    try {
      const { expense_account_id, id } = req.query;

      if (id) {
        const { data, error } = await supabase
          .from('expense_items')
          .select('*, expense_categories(name)')
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Expense item not found' });
          }
          throw error;
        }
        return res.status(200).json({ item: data });
      }

      if (!expense_account_id) {
        return res.status(400).json({ error: 'Missing expense_account_id parameter' });
      }

      const { data, error } = await supabase
        .from('expense_items')
        .select('*, expense_categories(name)')
        .eq('expense_account_id', expense_account_id)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return res.status(200).json({ items: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - Create new expense item
  if (req.method === 'POST') {
    const data = req.body;
    
    if (!data.expense_account_id) {
      return res.status(400).json({ error: 'Missing required field: expense_account_id' });
    }
    if (!data.description) {
      return res.status(400).json({ error: 'Missing required field: description' });
    }
    if (data.unit_price === undefined || data.unit_price === null) {
      return res.status(400).json({ error: 'Missing required field: unit_price' });
    }

    try {
      // Check if account exists and is open
      const { data: account, error: accountError } = await supabase
        .from('expense_accounts')
        .select('id, status')
        .eq('id', data.expense_account_id)
        .single();

      if (accountError) {
        if (accountError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Expense account not found' });
        }
        throw accountError;
      }

      if (account.status !== 'open') {
        return res.status(400).json({ error: 'Cannot add items to a closed account' });
      }

      const quantity = data.quantity || 1;
      const unitPrice = parseFloat(data.unit_price);
      const totalPrice = quantity * unitPrice;

      const itemData = {
        expense_account_id: data.expense_account_id,
        category_id: data.category_id || null,
        description: data.description,
        quantity: quantity,
        unit_price: unitPrice.toFixed(2),
        total_price: totalPrice.toFixed(2),
        date: data.date || new Date().toISOString(),
        user_id: user.id
      };

      const { data: created, error } = await supabase
        .from('expense_items')
        .insert([itemData])
        .select('*, expense_categories(name)');

      if (error) throw error;

      // Recalculate account total
      const newTotal = await recalculateAccountTotal(data.expense_account_id);

      return res.status(201).json({ 
        success: true, 
        item: created[0],
        account_total: newTotal.toFixed(2)
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT - Update expense item
  if (req.method === 'PUT') {
    const data = req.body;
    const id = data && data.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }

    try {
      // Get current item to check account status
      const { data: currentItem, error: fetchError } = await supabase
        .from('expense_items')
        .select('expense_account_id, expense_accounts(status)')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Expense item not found' });
        }
        throw fetchError;
      }

      if (currentItem.expense_accounts.status !== 'open') {
        return res.status(400).json({ error: 'Cannot modify items in a closed account' });
      }

      const updateData = {};
      
      if (data.category_id !== undefined) updateData.category_id = data.category_id;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.date !== undefined) updateData.date = data.date;

      // Handle quantity and price updates
      if (data.quantity !== undefined || data.unit_price !== undefined) {
        const { data: item } = await supabase
          .from('expense_items')
          .select('quantity, unit_price')
          .eq('id', id)
          .single();

        const quantity = data.quantity !== undefined ? data.quantity : item.quantity;
        const unitPrice = data.unit_price !== undefined ? parseFloat(data.unit_price) : parseFloat(item.unit_price);
        
        updateData.quantity = quantity;
        updateData.unit_price = unitPrice.toFixed(2);
        updateData.total_price = (quantity * unitPrice).toFixed(2);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const { data: updated, error } = await supabase
        .from('expense_items')
        .update(updateData)
        .eq('id', id)
        .select('*, expense_categories(name)');

      if (error) throw error;

      // Recalculate account total
      const newTotal = await recalculateAccountTotal(currentItem.expense_account_id);

      return res.status(200).json({ 
        success: true, 
        item: updated[0],
        account_total: newTotal.toFixed(2)
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE - Delete expense item
  if (req.method === 'DELETE') {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    try {
      // Get item to check account status and get account_id
      const { data: item, error: fetchError } = await supabase
        .from('expense_items')
        .select('expense_account_id, expense_accounts(status)')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Expense item not found' });
        }
        throw fetchError;
      }

      if (item.expense_accounts.status !== 'open') {
        return res.status(400).json({ error: 'Cannot delete items from a closed account' });
      }

      const accountId = item.expense_account_id;

      const { error } = await supabase
        .from('expense_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Recalculate account total
      const newTotal = await recalculateAccountTotal(accountId);

      return res.status(200).json({ 
        success: true,
        account_total: newTotal.toFixed(2)
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


